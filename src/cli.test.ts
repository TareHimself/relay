import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli, type CliIo } from './cli'
import { bootstrapAdminFromEnv } from './server'
import { cleanupStores, tempStore } from './test-support'
import { RelayStore } from './store/relay-store'

const directories: string[] = []

afterEach(async () => {
  await cleanupStores()
  for (const directory of directories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

async function cli(
  argv: string[],
  options: { stdin?: string; secrets?: string[]; env?: Record<string, string> } = {},
) {
  const directory = options.env?.DATA_DIR ?? (await fs.mkdtemp(join(tmpdir(), 'relay-cli-')))
  if (!options.env?.DATA_DIR) directories.push(directory)
  const out: string[] = []
  const err: string[] = []
  const secrets = [...(options.secrets ?? [])]
  const io: CliIo = {
    isTTY: options.stdin === undefined,
    readSecret: () => Promise.resolve(secrets.shift() ?? ''),
    readStdin: () => Promise.resolve(options.stdin ?? ''),
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  }
  const code = await runCli(argv, io, { ...options.env, DATA_DIR: directory })
  return { code, out: out.join('\n'), err: err.join('\n'), directory }
}

describe('relay CLI', () => {
  it('creates the admin on first set-password and resets it afterwards, signing everyone out', async () => {
    const first = await cli(['set-password', '--stdin'], {
      stdin: 'first password!\n',
      env: { ADMIN_HANDLE: 'tare', ADMIN_NAME: 'Tare B' },
    })
    expect(first.code).toBe(0)
    expect(first.out).toContain('Admin account "tare" created')

    const env = { DATA_DIR: first.directory }
    let store = await RelayStore.open(first.directory)
    const login = await store.accounts.login('first password!', 'test')
    expect(login?.user.displayName).toBe('Tare B')
    store.close()

    const second = await cli(['set-password'], {
      secrets: ['second password!', 'second password!'],
      env,
    })
    expect(second.code).toBe(0)
    expect(second.out).toContain('Everyone was signed out')

    store = await RelayStore.open(first.directory)
    expect(await store.accounts.login('first password!', 'test')).toBeNull()
    expect(await store.accounts.login('second password!', 'test')).not.toBeNull()
    expect(store.accounts.listSessions()).toHaveLength(1)
    store.close()
  })

  it('rejects mismatched confirmations and weak passwords without changing anything', async () => {
    const mismatch = await cli(['set-password'], { secrets: ['one password!', 'other password!'] })
    expect(mismatch.code).toBe(1)
    expect(mismatch.err).toContain('did not match')
    const weak = await cli(['set-password', '--stdin'], { stdin: 'short' })
    expect(weak.code).toBe(1)
    expect(weak.err).toContain('at least 8')
    const store = await RelayStore.open(weak.directory)
    expect(store.accounts.hasAdmin()).toBe(false)
    store.close()
  })

  it('renames the display name and shows the admin', async () => {
    const created = await cli(['set-password', '--stdin'], {
      stdin: 'a long password',
      env: { ADMIN_HANDLE: 'tare' },
    })
    const env = { DATA_DIR: created.directory }
    expect((await cli(['set-name', 'Tare', 'Belo'], { env })).out).toContain('"Tare Belo"')
    expect((await cli(['admin'], { env })).out).toBe('Admin: Tare Belo (handle: tare)')
    expect((await cli(['set-name'], { env })).code).toBe(1)
  })

  it('checks the database and thins history', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'relay-cli-'))
    directories.push(directory)
    const store = await RelayStore.open(directory)
    const project = store.createProject('Alpha', '', 'tare')
    store.createPage(project.id, 'Plan', 'text', 'tare')
    store.close()
    const env = { DATA_DIR: directory }
    const check = await cli(['check'], { env })
    expect(check.code).toBe(0)
    expect(check.out).toContain('Integrity check ok')
    expect(check.out).toContain('page_versions')
    expect((await cli(['thin-history', '--dry-run'], { env })).out).toContain('0 old autosave')
  })

  it('prints help and rejects unknown commands', async () => {
    expect((await cli(['help'])).out).toContain('set-password')
    const unknown = await cli(['nope'])
    expect(unknown.code).toBe(2)
    expect(unknown.err).toContain('Unknown command')
  })
})

describe('server startup rules', () => {
  it('creates the admin from ADMIN_PASSWORD only when none exists yet', async () => {
    const store = await tempStore()
    expect(await bootstrapAdminFromEnv(store, {})).toBe(false)
    expect(
      await bootstrapAdminFromEnv(store, {
        ADMIN_PASSWORD: 'env password!',
        ADMIN_HANDLE: 'tare',
        ADMIN_NAME: 'Tare',
      }),
    ).toBe(true)
    expect(store.accounts.admin()).toMatchObject({ handle: 'tare', displayName: 'Tare' })
    await store.accounts.resetPassword('changed by cli!')
    expect(await bootstrapAdminFromEnv(store, { ADMIN_PASSWORD: 'env password!' })).toBe(false)
    expect(await store.accounts.login('changed by cli!', 'test')).not.toBeNull()
    expect(await store.accounts.login('env password!', 'test')).toBeNull()
  })

  it('refuses the example password from .env.example for a new admin', async () => {
    const store = await tempStore()
    await expect(
      bootstrapAdminFromEnv(store, { ADMIN_PASSWORD: 'change-me-please' }),
    ).rejects.toThrow('example value')
    expect(store.accounts.hasAdmin()).toBe(false)
  })

  it('backs up and restores a data directory', async () => {
    const source = await cli(['set-password', '--stdin'], {
      stdin: 'first password!\n',
      env: { ADMIN_HANDLE: 'tare' },
    })
    const seeded = await RelayStore.open(source.directory)
    const project = await seeded.createProject('Alpha', '', 'tare')
    await seeded.createPage(project.id, 'Plan', 'body', 'tare')
    seeded.close()
    const archive = join(source.directory, 'out.tgz')
    const backup = await cli(['backup', archive], { env: { DATA_DIR: source.directory } })
    expect(backup.code).toBe(0)
    expect(backup.out).toContain('1 projects, 1 pages')

    const target = await fs.mkdtemp(join(tmpdir(), 'relay-cli-restore-'))
    directories.push(target)
    const restored = await cli(['restore', archive], { env: { DATA_DIR: target } })
    expect(restored.code).toBe(0)
    expect(restored.out).toContain('Restored 1 projects')
    const admin = await cli(['admin'], { env: { DATA_DIR: target } })
    expect(admin.out).toContain('handle: tare')

    const again = await cli(['restore', archive], { env: { DATA_DIR: target } })
    expect(again.code).not.toBe(0)
    expect(again.err).toContain('--replace')
    const replaced = await cli(['restore', archive, '--replace'], { env: { DATA_DIR: target } })
    expect(replaced.code).toBe(0)
    expect(replaced.out).toContain('Previous data moved to')
    expect((await fs.readdir(target)).some((name) => name.startsWith('replaced-'))).toBe(true)
    expect(await cli(['restore'], {}).then((r) => r.err)).toContain('Usage')
  })
})
