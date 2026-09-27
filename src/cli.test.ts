import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli, type CliIo } from './cli'
import { bootstrapAdminFromEnv } from './server'
import { cleanupStores, tempStore } from './test-support'
import { RelayStore } from './store/relay-store'

const exec = promisify(execFile)
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
    const mailmap = await exec('git', [
      '-C',
      join(created.directory, 'projects'),
      'config',
      'mailmap.file',
    ])
    expect(await fs.readFile(mailmap.stdout.trim(), 'utf8')).toBe('Tare Belo <tare@relay.local>\n')
  })

  it('adopts data authored by the old local identity', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'relay-cli-'))
    directories.push(directory)
    let store = await RelayStore.open(directory)
    const project = await store.createProject('Alpha', '', 'local')
    const page = await store.createPage(project.id, 'Plan', 'Ship the store', 'local')
    const thread = await store.threads.create(
      page.id,
      'Realistic?',
      { anchorText: 'Ship' },
      'local',
    )
    await store.threads.reply(thread.id, 'From an agent', 'claude')
    await store.accounts.bootstrapAdmin({
      handle: 'tare',
      displayName: 'Tare',
      password: 'pw pw pw pw',
    })
    store.close()

    const result = await cli(['adopt-local'], { env: { DATA_DIR: directory } })
    expect(result.code).toBe(0)
    expect(result.out).toContain('1 page(s)')

    store = await RelayStore.open(directory)
    const [adopted] = await store.threads.listForPage(page.id)
    expect(adopted?.messages.map((m) => m.author)).toEqual(['tare', 'claude'])
    expect(store.listEvents().every((event) => event.actor !== 'local')).toBe(true)
    const history = await store.history(page.id)
    expect(history.map((h) => [h.author, h.handle])).toEqual([['Tare', 'tare']])
    store.close()

    for (let reopen = 0; reopen < 3; reopen += 1) {
      store = await RelayStore.open(directory)
      expect((await store.history(page.id)).map((h) => h.author)).toEqual(['Tare'])
      store.close()
    }

    const again = await cli(['adopt-local'], { env: { DATA_DIR: directory } })
    expect(again.out).toContain('0 page(s)')
  })

  it('needs an admin before adopting', async () => {
    const result = await cli(['adopt-local'])
    expect(result.code).toBe(1)
    expect(result.err).toContain('set-password')
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
})
