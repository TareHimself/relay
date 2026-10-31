import { execFile } from 'node:child_process'
import { createWriteStream, existsSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { createGzip } from 'node:zlib'
import Database from 'better-sqlite3'
import tar from 'tar-stream'
import { afterEach, describe, expect, it } from 'vitest'
import {
  backupFileName,
  isFreshDataDir,
  parseInterval,
  pruneBackups,
  readBackup,
  restoreIfFresh,
  withBackupLock,
  writeBackup,
} from './backup'
import { RelayStore } from './relay-store'

const exec = promisify(execFile)
const directories: string[] = []
const stores: RelayStore[] = []

afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  for (const directory of directories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
  delete process.env.GIT_CONFIG_COUNT
  delete process.env.GIT_CONFIG_KEY_0
  delete process.env.GIT_CONFIG_VALUE_0
})

async function tempDirectory(prefix = 'relay-backup-test-'): Promise<string> {
  const directory = await fs.mkdtemp(join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

async function open(directory: string): Promise<RelayStore> {
  const store = await RelayStore.open(directory)
  stores.push(store)
  return store
}

async function seeded() {
  const directory = await tempDirectory()
  const store = await open(directory)
  await store.accounts.bootstrapAdmin({ handle: 'tare', password: 'test password!' })
  const project = await store.createProject('Alpha', 'first', 'tare')
  const page = await store.createPage(project.id, 'Plan', 'v1', 'tare')
  await store.editPage(page.id, { body: 'v2' }, page.revision, 'tare')
  const thread = await store.threads.create(page.id, 'Looks wrong', { anchorText: 'v2' }, 'tare')
  const token = store.tokens.create({ name: 'claude', scope: 'write' })
  await exec('git', [
    '-C',
    join(directory, 'projects'),
    'update-ref',
    'refs/relay/backup/x',
    'HEAD',
  ])
  return { directory, store, project, page, thread, token }
}

function useDefaultBranch(name: string) {
  process.env.GIT_CONFIG_COUNT = '1'
  process.env.GIT_CONFIG_KEY_0 = 'init.defaultBranch'
  process.env.GIT_CONFIG_VALUE_0 = name
}

describe('backup and restore', () => {
  it('round-trips pages, history, threads, tokens and relay refs', async () => {
    const { directory, store, page, thread, token } = await seeded()
    const file = join(await tempDirectory(), 'out.tgz')
    const manifest = await writeBackup(store, file)
    expect(manifest).toMatchObject({ format: 1, hasRepo: true, projects: 1, pages: 1, threads: 1 })

    const target = await tempDirectory()
    useDefaultBranch('master')
    await exec('git', ['-C', join(directory, 'projects'), 'branch', '-m', 'main'])
    await writeBackup(store, file)
    expect(await readBackup(file, target)).toMatchObject({ pages: 1 })

    const restored = await open(target)
    const copy = await restored.readPage(page.id)
    expect(copy.body).toBe('v2\n')
    expect((await restored.history(page.id)).length).toBe(2)
    expect((await restored.threads.listForPage(page.id)).map((t) => t.id)).toEqual([thread.id])
    expect(restored.tokens.authenticate(token.token)?.actor).toBe('claude')
    expect(restored.accounts.hasAdmin()).toBe(true)
    const branch = await exec('git', ['-C', join(target, 'projects'), 'symbolic-ref', 'HEAD'])
    expect(branch.stdout.trim()).toBe('refs/heads/main')
    const refs = await exec('git', ['-C', join(target, 'projects'), 'show-ref'])
    expect(refs.stdout).toContain('refs/relay/backup/x')
    expect(existsSync(join(target, 'projects', '.gitignore'))).toBe(true)
    expect((await fs.readdir(target)).filter((n) => n.startsWith('restoring-'))).toEqual([])
  })

  it('backs up and restores a store with no commits yet', async () => {
    const directory = await tempDirectory()
    const store = await open(directory)
    const file = join(await tempDirectory(), 'empty.tgz')
    expect((await writeBackup(store, file)).hasRepo).toBe(false)
    const target = await tempDirectory()
    await readBackup(file, target)
    const restored = await open(target)
    expect(restored.listProjects()).toEqual([])
  })

  it('replaces a stale database left by a failed first start', async () => {
    const { store } = await seeded()
    const file = join(await tempDirectory(), 'out.tgz')
    await writeBackup(store, file)
    const target = await tempDirectory()
    const aborted = await RelayStore.open(target)
    aborted.close()
    await fs.writeFile(join(target, 'db', 'state.db-wal'), 'garbage')
    expect(await isFreshDataDir(target)).toEqual({ fresh: true })
    await readBackup(file, target)
    expect(existsSync(join(target, 'db', 'state.db-wal'))).toBe(false)
    const restored = await open(target)
    expect(restored.listProjects().map((p) => p.name)).toEqual(['Alpha'])
  })

  it('refuses a non-fresh directory unless asked to replace, and then keeps the old data aside', async () => {
    const { store } = await seeded()
    const file = join(await tempDirectory(), 'out.tgz')
    await writeBackup(store, file)
    const target = await tempDirectory()
    const existing = await open(target)
    await existing.createProject('Old', '', 'someone')
    existing.close()
    stores.pop()
    await expect(readBackup(file, target)).rejects.toMatchObject({ code: 'conflict' })
    const log: string[] = []
    await readBackup(file, target, { replace: true, log: (line) => log.push(line) })
    const aside = (await fs.readdir(target)).find((n) => n.startsWith('replaced-'))
    expect(aside).toBeDefined()
    expect(existsSync(join(target, aside!, 'projects', '.git'))).toBe(true)
    expect(log.join('\n')).toContain('Previous data moved to')
    const restored = await open(target)
    expect(restored.listProjects().map((p) => p.name)).toEqual(['Alpha'])
  })

  it('refuses a database from a newer Relay', async () => {
    const { directory, store } = await seeded()
    store.close()
    stores.pop()
    const db = new Database(join(directory, 'db', 'state.db'))
    db.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)').run(
      'future',
      Date.now() + 10 * 365 * 86_400_000,
    )
    db.close()
    const reopened = await open(directory)
    const file = join(await tempDirectory(), 'out.tgz')
    await writeBackup(reopened, file)
    await expect(readBackup(file, await tempDirectory())).rejects.toMatchObject({
      code: 'invalid',
      message: expect.stringContaining('newer Relay'),
    })
  })

  it('refuses archives that escape the extraction directory or are not backups', async () => {
    const dir = await tempDirectory()
    const evil = join(dir, 'evil.tgz')
    const pack = tar.pack()
    const done = pipeline(pack, createGzip(), createWriteStream(evil))
    pack.entry({ name: '../escape.txt' }, 'x')
    pack.finalize()
    await done
    await expect(readBackup(evil, await tempDirectory())).rejects.toMatchObject({ code: 'invalid' })

    const plain = join(dir, 'plain.tgz')
    const pack2 = tar.pack()
    const done2 = pipeline(pack2, createGzip(), createWriteStream(plain))
    pack2.entry({ name: 'hello.txt' }, 'x')
    pack2.finalize()
    await done2
    await expect(readBackup(plain, await tempDirectory())).rejects.toMatchObject({
      message: expect.stringContaining('manifest.json'),
    })
    await expect(readBackup(join(dir, 'missing.tgz'), await tempDirectory())).rejects.toMatchObject(
      {
        code: 'not_found',
      },
    )
  })

  it('restores on first start only when the data directory is fresh', async () => {
    const { store } = await seeded()
    const file = join(await tempDirectory(), 'out.tgz')
    await writeBackup(store, file)
    const log: string[] = []
    const fresh = await tempDirectory()
    expect(await restoreIfFresh(undefined, fresh, (l) => log.push(l))).toBe(false)
    expect(await restoreIfFresh(file, fresh, (l) => log.push(l))).toBe(true)
    expect(log.at(-1)).toContain('Restored from')
    expect(await restoreIfFresh(file, fresh, (l) => log.push(l))).toBe(false)
    expect(log.at(-1)).toContain('RESTORE_FROM ignored: projects/ already has history')
    const restored = await open(fresh)
    expect(restored.listProjects().map((p) => p.name)).toEqual(['Alpha'])
  })

  it('does not mistake a parent repository for history', async () => {
    const parent = await tempDirectory()
    await exec('git', ['-C', parent, 'init', '-q'])
    await fs.writeFile(join(parent, 'a.txt'), 'a')
    await exec('git', ['-C', parent, 'add', 'a.txt'])
    await exec('git', [
      '-C',
      parent,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@x',
      'commit',
      '-qm',
      'a',
    ])
    const data = join(parent, 'data')
    await fs.mkdir(join(data, 'projects'), { recursive: true })
    expect(await isFreshDataDir(data)).toEqual({ fresh: true })
  })

  it('serialises backups per store and prunes old files', async () => {
    const { store } = await seeded()
    const dir = await tempDirectory()
    const first = withBackupLock(store, () => writeBackup(store, join(dir, 'a.tgz')))
    expect(() => withBackupLock(store, () => writeBackup(store, join(dir, 'b.tgz')))).toThrow(
      /already running/,
    )
    await first
    await withBackupLock(store, () => writeBackup(store, join(dir, 'c.tgz')))

    for (const name of [
      'relay-20260101-000000.tgz',
      'relay-20260102-000000.tgz',
      'relay-20260103-000000.tgz',
      'other.tgz',
    ]) {
      await fs.writeFile(join(dir, name), '')
    }
    expect(await pruneBackups(dir, 2)).toEqual(['relay-20260101-000000.tgz'])
    expect(existsSync(join(dir, 'other.tgz'))).toBe(true)
    expect(backupFileName(new Date('2026-10-30T12:34:56Z'))).toBe('relay-20261030-123456.tgz')
    expect(parseInterval('24h')).toBe(86_400_000)
    expect(parseInterval('30 m')).toBe(1_800_000)
    expect(() => parseInterval('daily')).toThrow(/BACKUP_EVERY/)
  })
})
