import {
  createReadStream,
  createWriteStream,
  existsSync,
  promises as fs,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createGunzip, createGzip } from 'node:zlib'
import Database from 'better-sqlite3'
import tar from 'tar-stream'
import { StoreError } from '../core/errors'
import { Git } from './git'
import { migrationsFolder, type RelayStore } from './relay-store'

export const BACKUP_FORMAT = 1

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  relayVersion: string
  createdAt: string
  hasRepo: boolean
  projects: number
  pages: number
  threads: number
}

export type Log = (line: string) => void

const packageJson = ['../../package.json', '../package.json']
  .map((candidate) => fileURLToPath(new URL(candidate, import.meta.url)))
  .find((file) => existsSync(file))

function relayVersion(): string {
  if (!packageJson) return 'unknown'
  const parsed = JSON.parse(readFileSync(packageJson, 'utf8')) as { version?: string }
  return parsed.version ?? 'unknown'
}

function stamp(now = new Date()): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/T(\d{6}).*/, '-$1')
}

export function backupFileName(now = new Date()): string {
  return `relay-${stamp(now)}.tgz`
}

export const BACKUP_FILE_PATTERN = /^relay-\d{8}-\d{6}\.tgz$/

async function* walk(root: string, dir = root): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(root, path)
    else if (entry.isFile()) yield path
  }
}

function pipeToFile(source: tar.Pack, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(outPath)
    out.on('finish', resolve).on('error', reject)
    source.on('error', reject).pipe(createGzip()).on('error', reject).pipe(out)
  })
}

async function packDirectory(dir: string, outPath: string): Promise<void> {
  const pack = tar.pack()
  const done = pipeToFile(pack, outPath)
  try {
    for await (const file of walk(dir)) {
      const { size, mode } = await fs.stat(file)
      const name = relative(dir, file).split(sep).join(posix.sep)
      await pipeline(createReadStream(file), pack.entry({ name, size, mode }))
    }
    pack.finalize()
  } catch (error) {
    pack.destroy(error as Error)
    throw error
  }
  await done
}

function safeEntryPath(dest: string, name: string): string {
  const normalized = posix.normalize(name)
  if (
    name.includes('\\') ||
    normalized.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new StoreError('invalid', `Refusing archive entry "${name}"`)
  }
  return join(dest, ...normalized.split('/'))
}

function extractArchive(file: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const extract = tar.extract()
    const fail = (error: unknown) => {
      extract.destroy()
      reject(error)
    }
    extract.on('entry', (header, stream, next) => {
      const drain = () => {
        stream.resume()
        stream.on('end', () => next())
      }
      let target: string
      try {
        target = safeEntryPath(dest, header.name)
      } catch (error) {
        fail(error)
        return
      }
      if (header.type === 'directory') {
        fs.mkdir(target, { recursive: true }).then(drain, fail)
        return
      }
      if (header.type !== 'file') {
        drain()
        return
      }
      fs.mkdir(dirname(target), { recursive: true })
        .then(() => pipeline(stream, createWriteStream(target)))
        .then(() => next(), fail)
    })
    extract.on('finish', resolve).on('error', fail)
    createReadStream(file).on('error', fail).pipe(createGunzip()).on('error', fail).pipe(extract)
  })
}

export async function writeBackup(store: RelayStore, outPath: string): Promise<BackupManifest> {
  const tmp = await fs.mkdtemp(join(tmpdir(), 'relay-backup-'))
  try {
    const info = await store.snapshot(tmp)
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      relayVersion: relayVersion(),
      createdAt: new Date().toISOString(),
      ...info,
    }
    await fs.writeFile(join(tmp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    await fs.mkdir(dirname(resolve(outPath)), { recursive: true })
    await packDirectory(tmp, outPath)
    return manifest
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

const running = new WeakMap<RelayStore, Promise<unknown>>()

export function withBackupLock<T>(store: RelayStore, work: () => Promise<T>): Promise<T> {
  if (running.has(store)) throw new StoreError('conflict', 'A backup is already running')
  const result = work().finally(() => running.delete(store))
  running.set(store, result)
  return result
}

function readonlyDb(path: string): Database.Database {
  return new Database(path, { readonly: true, fileMustExist: true })
}

function isMissingTable(error: unknown): boolean {
  return error instanceof Error && /no such table/.test(error.message)
}

function latestLocalMigration(): number {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ when: number }> }
  return Math.max(0, ...journal.entries.map((entry) => entry.when))
}

function assertMigrationsSupported(dbPath: string): void {
  const db = readonlyDb(dbPath)
  try {
    const row = db.prepare('select max(created_at) as latest from __drizzle_migrations').get() as
      { latest: number | null } | undefined
    if (row?.latest && row.latest > latestLocalMigration()) {
      throw new StoreError(
        'invalid',
        'This backup was made by a newer Relay (its database has a migration this version lacks). Update Relay, then restore.',
      )
    }
  } catch (error) {
    if (!isMissingTable(error)) throw error
  } finally {
    db.close()
  }
}

export function pendingOperations(dbPath: string): Array<{ id: string; path: string }> {
  const db = readonlyDb(dbPath)
  try {
    return db.prepare("select id, path from operations where status = 'pending'").all() as Array<{
      id: string
      path: string
    }>
  } catch (error) {
    if (isMissingTable(error)) return []
    throw error
  } finally {
    db.close()
  }
}

export async function isFreshDataDir(
  dataDir: string,
): Promise<{ fresh: true } | { fresh: false; reason: string }> {
  const projects = join(dataDir, 'projects')
  if (existsSync(join(projects, '.git'))) {
    const hasCommits = await new Git(projects).run(['rev-parse', '--verify', 'HEAD']).then(
      () => true,
      () => false,
    )
    if (hasCommits) return { fresh: false, reason: 'projects/ already has history' }
  }
  const dbPath = join(dataDir, 'db', 'state.db')
  if (existsSync(dbPath)) {
    const db = readonlyDb(dbPath)
    try {
      const row = db.prepare('select count(*) as n from users').get() as { n: number }
      if (row.n > 0) return { fresh: false, reason: 'db/state.db already has an account' }
    } catch (error) {
      if (!isMissingTable(error)) throw error
    } finally {
      db.close()
    }
  }
  return { fresh: true }
}

async function restoreRepo(bundle: string, projects: string): Promise<void> {
  await fs.mkdir(projects, { recursive: true })
  const git = new Git(projects)
  await git.run(['init', '-q'])
  await git.run(['bundle', 'verify', '-q', bundle])
  await git.run(['fetch', '-q', '--update-head-ok', bundle, 'refs/*:refs/*'])
  const heads = (await git.run(['bundle', 'list-heads', bundle]))
    .split('\n')
    .map((line) => line.trim().split(/\s+/, 2) as [string, string])
  const headSha = heads.find(([, ref]) => ref === 'HEAD')?.[0]
  const branch = heads.find(([sha, ref]) => sha === headSha && ref.startsWith('refs/heads/'))?.[1]
  if (!branch) throw new StoreError('invalid', 'The backup repository has no branch at HEAD')
  await git.run(['symbolic-ref', 'HEAD', branch])
  await git.run(['reset', '-q', '--hard'])
}

async function moveAside(root: string, destination: string): Promise<void> {
  for (const name of ['projects', 'db']) {
    const from = join(root, name)
    if (!existsSync(from)) continue
    await fs.mkdir(destination, { recursive: true })
    await fs.rename(from, join(destination, name))
  }
}

export interface RestoreOptions {
  replace?: boolean | undefined
  log?: Log | undefined
}

export async function readBackup(
  file: string,
  dataDir: string,
  options: RestoreOptions = {},
): Promise<BackupManifest> {
  const log = options.log ?? (() => {})
  const root = resolve(dataDir)
  if (!existsSync(file)) throw new StoreError('not_found', `Backup file not found: ${file}`)
  const state = await isFreshDataDir(root)
  if (!state.fresh && !options.replace) {
    throw new StoreError(
      'conflict',
      `Data directory is not empty (${state.reason}). Stop the server and pass --replace to move the current data aside.`,
    )
  }
  const now = stamp()
  const tmp = await fs.mkdtemp(join(tmpdir(), 'relay-restore-'))
  const staging = join(root, `restoring-${now}`)
  try {
    await extractArchive(file, tmp)
    const manifestPath = join(tmp, 'manifest.json')
    if (!existsSync(manifestPath)) {
      throw new StoreError('invalid', 'Not a Relay backup: manifest.json is missing')
    }
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as BackupManifest
    if (manifest.format !== BACKUP_FORMAT) {
      throw new StoreError('invalid', `Unsupported backup format ${String(manifest.format)}`)
    }
    const dbSource = join(tmp, 'state.db')
    if (!existsSync(dbSource)) {
      throw new StoreError('invalid', 'Not a Relay backup: state.db is missing')
    }
    assertMigrationsSupported(dbSource)
    const projects = join(staging, 'projects')
    if (manifest.hasRepo) await restoreRepo(join(tmp, 'repo.bundle'), projects)
    else await fs.mkdir(projects, { recursive: true })
    await fs.mkdir(join(staging, 'db'), { recursive: true })
    await fs.copyFile(dbSource, join(staging, 'db', 'state.db'))
    const blobs = join(tmp, 'blobs')
    if (existsSync(blobs)) await fs.cp(blobs, join(projects, 'blobs'), { recursive: true })
    for (const operation of pendingOperations(join(staging, 'db', 'state.db'))) {
      log(`Backup has a pending write for ${operation.path} (${operation.id}); recovered on start.`)
    }
    for (const suffix of ['-wal', '-shm']) {
      await fs.rm(join(staging, 'db', `state.db${suffix}`), { force: true })
    }
    if (state.fresh) {
      await fs.rm(join(root, 'projects'), { recursive: true, force: true })
      await fs.rm(join(root, 'db'), { recursive: true, force: true })
    } else {
      const aside = join(root, `replaced-${now}`)
      await moveAside(root, aside)
      log(`Previous data moved to ${aside}`)
    }
    await fs.rename(projects, join(root, 'projects'))
    await fs.rename(join(staging, 'db'), join(root, 'db'))
    return manifest
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
    await fs.rm(staging, { recursive: true, force: true })
  }
}

export async function restoreIfFresh(
  file: string | undefined,
  dataDir: string,
  log: Log,
): Promise<boolean> {
  if (!file) return false
  const state = await isFreshDataDir(resolve(dataDir))
  if (!state.fresh) {
    log(`RESTORE_FROM ignored: ${state.reason}`)
    return false
  }
  await readBackup(file, dataDir, { log })
  log(`Restored from ${file}`)
  return true
}

const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const

export function parseInterval(text: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(text.trim())
  if (!match) {
    throw new StoreError('invalid', `BACKUP_EVERY must look like 30m, 12h or 1d, got "${text}"`)
  }
  return Number(match[1]) * UNITS[match[2] as keyof typeof UNITS]
}

export async function pruneBackups(dir: string, keep: number): Promise<string[]> {
  const names = (await fs.readdir(dir)).filter((name) => BACKUP_FILE_PATTERN.test(name)).sort()
  const stale = names.slice(0, Math.max(0, names.length - keep))
  for (const name of stale) await fs.rm(join(dir, name), { force: true })
  return stale
}

export function scheduleBackups(
  store: RelayStore,
  options: { dir: string; every: number; keep: number; log: Log },
): { stop: () => void } {
  const run = async () => {
    try {
      await fs.mkdir(options.dir, { recursive: true })
      const file = join(options.dir, backupFileName())
      await withBackupLock(store, () => writeBackup(store, file))
      const pruned = await pruneBackups(options.dir, options.keep)
      options.log(
        `Backup written to ${file}${pruned.length ? ` (removed ${pruned.length} old)` : ''}`,
      )
    } catch (error) {
      options.log(`Backup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const timer = setInterval(() => void run(), options.every)
  timer.unref()
  return { stop: () => clearInterval(timer) }
}
