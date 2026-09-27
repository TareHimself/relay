import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './http/app'
import { RelayStore } from './store/relay-store'

const EXAMPLE_PASSWORD = 'change-me-please'

interface AdminEnv {
  ADMIN_PASSWORD?: string | undefined
  ADMIN_HANDLE?: string | undefined
  ADMIN_NAME?: string | undefined
}

export async function bootstrapAdminFromEnv(store: RelayStore, env: AdminEnv): Promise<boolean> {
  if (store.accounts.hasAdmin() || !env.ADMIN_PASSWORD) return false
  if (env.ADMIN_PASSWORD === EXAMPLE_PASSWORD) {
    throw new Error('ADMIN_PASSWORD is still the example value from .env.example. Choose your own.')
  }
  await store.accounts.bootstrapAdmin({
    handle: env.ADMIN_HANDLE || 'admin',
    displayName: env.ADMIN_NAME || undefined,
    password: env.ADMIN_PASSWORD,
  })
  await store.syncMailmap()
  return true
}

export async function startServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const store = await RelayStore.open(env.DATA_DIR ?? './data', { publicUrl: env.PUBLIC_URL })
  const created = await bootstrapAdminFromEnv(store, env)
  const admin = store.accounts.admin()
  if (!admin) {
    store.close()
    throw new Error(
      'No admin account yet. Set ADMIN_PASSWORD for this start, or run "relay set-password".',
    )
  }
  const hostname = env.HOST ?? '127.0.0.1'

  const app = createApp(store)
  const webRoot = fileURLToPath(new URL('../web/dist', import.meta.url))
  app.use('/*', serveStatic({ root: webRoot }))
  app.get('*', serveStatic({ path: resolve(webRoot, 'index.html') }))

  const port = Number(env.PORT ?? 47821)
  const server = serve({ fetch: app.fetch, port, hostname })
  console.log(`Relay listening on http://${hostname}:${port}`)
  console.log(`Admin: ${admin.handle}${created ? ' (created from ADMIN_PASSWORD)' : ''}`)
  const shutdown = () => {
    server.close()
    store.close()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
