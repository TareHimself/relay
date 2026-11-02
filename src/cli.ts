import { resolve } from 'node:path'
import { StoreError } from './core/errors'
import { RelayStore } from './store/relay-store'
import { watch } from './watch'
import { backupFileName, readBackup, writeBackup } from './store/backup'
import { DEFAULT_THIN, thinHistory } from './store/history'
import { importGitRepo } from './store/import-git'

export interface CliIo {
  isTTY: boolean
  readSecret: (prompt: string) => Promise<string>
  readStdin: () => Promise<string>
  out: (line: string) => void
  err: (line: string) => void
}

export interface CliEnv {
  DATA_DIR?: string | undefined
  HISTORY_KEEP_ALL_DAYS?: string | undefined
  HISTORY_KEEP_DAILY_DAYS?: string | undefined
  ADMIN_HANDLE?: string | undefined
  ADMIN_NAME?: string | undefined
  RELAY_URL?: string | undefined
  RELAY_TOKEN?: string | undefined
}

const HELP = `Usage: relay <command>

Commands:
  serve                    Start the server (default)
  set-password [--stdin]   Set or reset the admin password and sign everyone out
  set-name <display name>  Change the admin's display name
  admin                    Show the admin account
  watch [--all]            Print one line per comment that mentions the token's @handle
                           (needs RELAY_TOKEN; RELAY_URL defaults to http://localhost:47821)
  thin-history [--dry-run] Drop old autosave versions: keep everything for
                           HISTORY_KEEP_ALL_DAYS (7), then one version per person per day until
                           HISTORY_KEEP_DAILY_DAYS (90), then one per week (stop the server first)
  check                    Run the database integrity check and show the size of each table
  import-git <dir>         Import pages, history and comments from a git repository written by
                           an older Relay (runs on its own at start when DATA_DIR/projects/.git exists)
  backup [file.tgz]        Write the whole instance (pages, history, threads, tokens, accounts)
                           to one archive (stop the server first; a running server backs up
                           from Settings or BACKUP_EVERY instead)
  restore <file.tgz>       Restore an archive into an empty DATA_DIR (stop the server first;
                           --replace moves existing data aside first)
  help                     Show this help

Environment: DATA_DIR (default ./data), ADMIN_HANDLE and ADMIN_NAME (used when the
admin account is first created), HISTORY_KEEP_ALL_DAYS and HISTORY_KEEP_DAILY_DAYS, plus
HOST, PORT and ADMIN_PASSWORD for the server.`

async function readPassword(args: string[], io: CliIo): Promise<string> {
  if (args.includes('--stdin') || !io.isTTY) return (await io.readStdin()).replace(/\r?\n$/, '')
  const first = await io.readSecret('New password: ')
  const second = await io.readSecret('Repeat password: ')
  if (first !== second) throw new StoreError('invalid', 'The passwords did not match')
  return first
}

async function withStore<T>(env: CliEnv, work: (store: RelayStore) => Promise<T>): Promise<T> {
  const store = await RelayStore.open(env.DATA_DIR ?? './data')
  try {
    return await work(store)
  } finally {
    store.close()
  }
}

export async function runCli(
  argv: string[],
  io: CliIo,
  env: CliEnv = {},
  signal?: AbortSignal,
): Promise<number> {
  const [command = 'help', ...args] = argv
  try {
    switch (command) {
      case 'help':
      case '--help':
      case '-h':
        io.out(HELP)
        return 0
      case 'set-password': {
        const password = await readPassword(args, io)
        return await withStore(env, async (store) => {
          if (store.accounts.hasAdmin()) {
            await store.accounts.resetPassword(password)
            io.out('Password updated. Everyone was signed out.')
          } else {
            const admin = await store.accounts.bootstrapAdmin({
              handle: env.ADMIN_HANDLE || 'admin',
              displayName: env.ADMIN_NAME || undefined,
              password,
            })
            io.out(`Admin account "${admin.handle}" created. Sign-in is now required.`)
          }
          return 0
        })
      }
      case 'set-name': {
        const name = args.join(' ').trim()
        if (!name) throw new StoreError('invalid', 'Usage: relay set-name <display name>')
        return await withStore(env, async (store) => {
          store.renameAdmin(name)
          io.out(`Display name changed to "${name}".`)
          return 0
        })
      }
      case 'admin':
        return await withStore(env, (store) => {
          const admin = store.accounts.admin()
          io.out(
            admin
              ? `Admin: ${admin.displayName} (handle: ${admin.handle})`
              : 'No admin account yet. Run "relay set-password" to create one.',
          )
          return Promise.resolve(0)
        })
      case 'watch': {
        const token = env.RELAY_TOKEN
        if (!token) throw new StoreError('invalid', 'Set RELAY_TOKEN to an API token to watch')
        await watch({
          url: env.RELAY_URL || 'http://localhost:47821',
          token,
          everything: args.includes('--all'),
          out: io.out,
          err: io.err,
          signal,
        })
        return 0
      }
      case 'backup': {
        const out = resolve(args[0] ?? backupFileName())
        return await withStore(env, async (store) => {
          const manifest = await writeBackup(store, out)
          io.out(
            `Wrote ${out} (${manifest.projects} projects, ${manifest.pages} pages, ` +
              `${manifest.threads} threads).`,
          )
          return 0
        })
      }
      case 'restore': {
        const file = args.find((arg) => !arg.startsWith('--'))
        if (!file) throw new StoreError('invalid', 'Usage: relay restore <file.tgz> [--replace]')
        const manifest = await readBackup(file, env.DATA_DIR ?? './data', {
          replace: args.includes('--replace'),
          log: io.out,
        })
        io.out(
          `Restored ${manifest.projects} projects, ${manifest.pages} pages and ` +
            `${manifest.threads} threads from ${file}.`,
        )
        return 0
      }
      case 'thin-history':
        return await withStore(env, (store) => {
          const dryRun = args.includes('--dry-run')
          const days = (value: string | undefined, fallback: number) =>
            value && Number(value) > 0 ? Number(value) : fallback
          const result = thinHistory(store.database, {
            keepAllDays: days(env.HISTORY_KEEP_ALL_DAYS, DEFAULT_THIN.keepAllDays),
            keepDailyDays: days(env.HISTORY_KEEP_DAILY_DAYS, DEFAULT_THIN.keepDailyDays),
            dryRun,
          })
          io.out(
            dryRun
              ? `${result.candidates} old autosave version(s) would be removed. Run again without --dry-run to remove them.`
              : `Removed ${result.deleted} old autosave version(s).`,
          )
          return Promise.resolve(0)
        })
      case 'check':
        return await withStore(env, (store) => {
          const problems = store.integrityCheck().filter((line) => line !== 'ok')
          for (const line of problems) io.err(line)
          io.out(problems.length ? 'Integrity check FAILED' : 'Integrity check ok')
          for (const { table, bytes } of store.tableSizes()) {
            io.out(`${table.padEnd(24)} ${(bytes / 1024).toFixed(0).padStart(8)} KB`)
          }
          return Promise.resolve(problems.length ? 1 : 0)
        })
      case 'import-git': {
        const dir = args[0]
        if (!dir) throw new StoreError('invalid', 'Usage: relay import-git <repository dir>')
        return await withStore(env, async (store) => {
          const summary = await importGitRepo(store.database, resolve(dir), io.out)
          io.out(
            `Imported ${summary.projects} projects, ${summary.pages} pages (${summary.deletedPages} deleted), ` +
              `${summary.versions} versions and ${summary.threads} threads.`,
          )
          return 0
        })
      }
      default:
        io.err(`Unknown command "${command}".\n\n${HELP}`)
        return 2
    }
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error))
    return 1
  }
}
