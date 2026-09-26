import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { Access } from '../auth/access'
import type { RelayStore } from '../store/relay-store'
import { Workspace } from '../workspace'

export type AppEnv = { Variables: { workspace: Workspace } }

export const SESSION_COOKIE = 'relay_session'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function bearerOf(header: string | undefined): string | null {
  return /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1] ?? null
}

export function sameOrigin(c: Context): boolean {
  const origin = c.req.header('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === c.req.header('host')
  } catch {
    return false
  }
}

export function authenticate(
  store: RelayStore,
  options: { mode: 'api' | 'mcp' },
): MiddlewareHandler<AppEnv> {
  const unauthorized = (c: Context, message: string) => {
    c.header('WWW-Authenticate', 'Bearer')
    return c.json({ error: 'unauthorized', message }, 401)
  }
  return async (c, next) => {
    const header = c.req.header('authorization')
    if (header) {
      const secret = bearerOf(header)
      const context = secret ? store.tokens.authenticate(secret) : null
      if (!context) return unauthorized(c, 'A valid API token is required')
      c.set('workspace', new Workspace(store, new Access(store, context)))
      return next()
    }
    if (options.mode === 'mcp') return unauthorized(c, 'A valid API token is required')

    const cookie = getCookie(c, SESSION_COOKIE)
    const session = cookie ? store.accounts.authenticate(cookie) : null
    if (session) {
      if (!SAFE_METHODS.has(c.req.method) && !sameOrigin(c)) {
        return c.json({ error: 'forbidden', message: 'Cross-origin request refused' }, 403)
      }
      const context = {
        kind: 'admin' as const,
        actor: session.user.handle,
        scope: 'write' as const,
        projectId: null,
        sessionId: session.sessionId,
      }
      c.set('workspace', new Workspace(store, new Access(store, context)))
      return next()
    }
    return unauthorized(c, 'Sign in required')
  }
}
