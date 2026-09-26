import { StoreError } from './core/errors'
import { RelayStore } from './store/relay-store'
import { watch } from './watch'

export interface CliIo {
  isTTY: boolean
  readSecret: (prompt: string) => Promise<string>
  readStdin: () => Promise<string>
  out: (line: string) => void
  err: (line: string) => void
}

export interface CliEnv {
  DATA_DIR?: string | undefined
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
  adopt-local              Reassign data authored by the old "local" identity to the admin
                           (stop the server first)
  watch [--all]            Print one line per comment that mentions the token's @handle
                           (needs RELAY_TOKEN; RELAY_URL defaults to http://localhost:47821)
  tidy-history [--apply]   Merge old runs of autosave commits into single versions
                           (shows the plan first; --apply rewrites history, stop the server)
  help                     Show this help

Environment: DATA_DIR (default ./data), ADMIN_HANDLE and ADMIN_NAME (used when the
admin account is first created), plus HOST, PORT and ADMIN_PASSWORD for the server.`

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
            await store.syncMailmap()
            io.out(`Admin account "${admin.handle}" created. Sign-in is now required.`)
          }
          return 0
        })
      }
      case 'set-name': {
        const name = args.join(' ').trim()
        if (!name) throw new StoreError('invalid', 'Usage: relay set-name <display name>')
        return await withStore(env, async (store) => {
          await store.renameAdmin(name)
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
      case 'tidy-history':
        return await withStore(env, async (store) => {
          const apply = args.includes('--apply')
          const result = await store.tidyHistory(apply)
          io.out(
            `History has ${result.before} commits; tidying would leave ${result.after} ` +
              `(${result.merged} merged).`,
          )
          if (result.applied) {
            io.out(
              `Done. The previous history is kept at ${result.backupRef}; to undo, run: ` +
                `git -C <data dir> update-ref HEAD ${result.backupRef}`,
            )
          } else if (result.merged > 0) {
            io.out('Nothing changed. Stop the server, then run again with --apply.')
          } else {
            io.out('Nothing to tidy.')
          }
          return 0
        })
      case 'adopt-local':
        return await withStore(env, async (store) => {
          const admin = store.accounts.admin()
          if (!admin)
            throw new StoreError('invalid', 'Create the admin first with "relay set-password"')
          const { threadFiles, events } = await store.adoptActor('local', admin.handle)
          io.out(
            `Reassigned to ${admin.handle}: comments in ${threadFiles} page(s) and ${events} event(s). ` +
              'Old commits now show your name.',
          )
          return 0
        })
      default:
        io.err(`Unknown command "${command}".\n\n${HELP}`)
        return 2
    }
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error))
    return 1
  }
}
