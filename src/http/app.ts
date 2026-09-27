import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { StoreError } from '../core/errors'
import { mcpHandler } from '../mcp/handler'
import {
  editInput,
  eventsQuery,
  pageInput,
  projectInput,
  renamePageInput,
  renameProjectInput,
  replyInput,
  restoreInput,
  saveInput,
  threadFilter,
  threadInput,
} from '../shared/requests'
import { searchQuery } from '../shared/search'
import { tagsInput } from '../shared/tags'
import { tokenInput } from '../shared/tokens'
import type { RelayStore } from '../store/relay-store'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { streamSSE } from 'hono/streaming'
import { Access } from '../auth/access'
import { accountInput, loginInput, passwordInput } from '../shared/accounts'
import { Workspace } from '../workspace'
import { SESSION_COOKIE, authenticate, sameOrigin, type AppEnv } from './auth'
import { LoginThrottle } from './throttle'

const HEARTBEAT_MS = 25_000

const STATUS = { not_found: 404, invalid: 400, forbidden: 403 } as const

const SESSION_SECONDS = 30 * 24 * 60 * 60
const MAX_BODY_BYTES = 5 * 1024 * 1024

export function createApp(store: RelayStore) {
  const app = new Hono<AppEnv>()
  const throttle = new LoginThrottle()
  const trustProxy = process.env.TRUST_PROXY === '1'
  const clientKey = (c: Context) =>
    (trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined) ??
    (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket
      ?.remoteAddress ??
    'unknown'
  const isSecure = (c: Context) =>
    new URL(c.req.url).protocol === 'https:' ||
    (trustProxy && c.req.header('x-forwarded-proto') === 'https')
  app.onError((error, c) => {
    if (error instanceof StoreError) {
      const status = STATUS[error.code as keyof typeof STATUS] ?? 409
      return c.json({ error: error.code, message: error.message, details: error.details }, status)
    }
    if (error instanceof z.ZodError) return c.json({ error: 'invalid', issues: error.issues }, 400)
    if (error instanceof HTTPException) {
      if (error.status >= 500) console.error(error)
      else {
        const client = c.req.header('user-agent') ?? 'unknown'
        const version = c.req.header('mcp-protocol-version') ?? 'none'
        console.warn(
          `${c.req.method} ${c.req.path} refused with ${error.status} (mcp-protocol-version: ${version}, user-agent: ${client})`,
        )
      }
      return error.getResponse()
    }
    console.error(error)
    return c.json({ error: 'internal', message: 'Internal server error' }, 500)
  })

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: 'no-referrer',
      xFrameOptions: 'DENY',
    }),
  )
  const tooLarge = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: 'invalid', message: 'Request body is too large' }, 413),
  })
  app.use('/api/*', tooLarge)
  app.use('/mcp', tooLarge)

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.all('/mcp', authenticate(store, { mode: 'mcp' }), mcpHandler())

  app.post('/api/login', async (c) => {
    if (!sameOrigin(c))
      return c.json({ error: 'forbidden', message: 'Cross-origin request refused' }, 403)
    const { password } = loginInput.parse(await c.req.json())
    const key = clientKey(c)
    const wait = throttle.retryAfterSeconds(key)
    if (wait > 0) {
      c.header('Retry-After', String(wait))
      return c.json(
        { error: 'too_many_attempts', message: `Too many attempts. Try again in ${wait}s` },
        429,
      )
    }
    if (!store.accounts.hasAdmin()) {
      throw new StoreError('invalid', 'Sign-in is not enabled: no admin password has been set')
    }
    const login = await store.accounts.login(password, c.req.header('user-agent') ?? '')
    if (!login) {
      throttle.fail(key)
      return c.json({ error: 'unauthorized', message: 'Incorrect password' }, 401)
    }
    throttle.reset(key)
    setCookie(c, SESSION_COOKIE, login.secret, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_SECONDS,
      secure: isSecure(c),
    })
    const context = {
      kind: 'admin' as const,
      actor: login.user.handle,
      scope: 'write' as const,
      projectId: null,
      sessionId: login.sessionId,
    }
    return c.json(new Workspace(store, new Access(store, context)).whoami())
  })
  app.post('/api/logout', (c) => {
    if (!sameOrigin(c))
      return c.json({ error: 'forbidden', message: 'Cross-origin request refused' }, 403)
    const cookie = getCookie(c, SESSION_COOKIE)
    if (cookie) store.accounts.logout(cookie)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  const api = new Hono<AppEnv>()
  api.use('*', authenticate(store, { mode: 'api' }))
  const workspace = (c: { get: (key: 'workspace') => AppEnv['Variables']['workspace'] }) =>
    c.get('workspace')

  api.get('/whoami', (c) => c.json(workspace(c).whoami()))
  api.get('/people', (c) => c.json(workspace(c).people()))
  api.patch('/account', async (c) => {
    const { displayName } = accountInput.parse(await c.req.json())
    return c.json(await workspace(c).renameSelf(displayName))
  })
  api.post('/account/password', async (c) => {
    const { current, next } = passwordInput.parse(await c.req.json())
    await workspace(c).changePassword(current, next)
    return c.json({ ok: true })
  })
  api.get('/sessions', (c) => c.json(workspace(c).sessions()))
  api.delete('/sessions/:sessionId', (c) => {
    workspace(c).revokeSession(c.req.param('sessionId'))
    return c.json({ ok: true })
  })
  api.get('/problems', (c) => {
    workspace(c).access.admin()
    return c.json(store.listProblems())
  })

  api.get('/tokens', (c) => {
    workspace(c).access.admin()
    return c.json(store.tokens.list())
  })
  api.post('/tokens', async (c) => {
    workspace(c).access.admin()
    return c.json(store.tokens.create(tokenInput.parse(await c.req.json())), 201)
  })
  api.delete('/tokens/:tokenId', (c) => {
    workspace(c).access.admin()
    store.tokens.revoke(c.req.param('tokenId'))
    return c.json({ ok: true })
  })

  api.get('/projects', (c) => c.json(workspace(c).listProjects()))
  api.post('/projects', async (c) => {
    const input = projectInput.parse(await c.req.json())
    return c.json(await workspace(c).createProject(input.name, input.description), 201)
  })
  api.patch('/projects/:projectId', async (c) => {
    const { name } = renameProjectInput.parse(await c.req.json())
    return c.json(await workspace(c).renameProject(c.req.param('projectId'), name))
  })
  api.get('/projects/:projectId/pages', (c) =>
    c.json(workspace(c).listPages(c.req.param('projectId'))),
  )
  api.post('/projects/:projectId/pages', async (c) => {
    const input = pageInput.parse(await c.req.json())
    return c.json(
      await workspace(c).createPage(c.req.param('projectId'), input.title, input.body, input.tags),
      201,
    )
  })
  api.get('/tags', (c) => c.json(workspace(c).listTags(c.req.query('projectId'))))
  api.put('/pages/:pageId/tags', async (c) => {
    const input = tagsInput.parse(await c.req.json())
    return c.json(await workspace(c).setTags(c.req.param('pageId'), input.tags, input.ifRevision))
  })

  api.get('/pages/:pageId', async (c) =>
    c.json(
      await workspace(c).readPage(c.req.param('pageId'), {
        sinceRevision: c.req.query('sinceRevision'),
        includeBody: c.req.query('includeBody') !== 'false',
      }),
    ),
  )
  api.patch('/pages/:pageId', async (c) => {
    const { ifRevision, ...change } = editInput.parse(await c.req.json())
    return c.json(await workspace(c).editPage(c.req.param('pageId'), change, ifRevision))
  })
  api.put('/pages/:pageId', async (c) => {
    const input = saveInput.parse(await c.req.json())
    return c.json(
      await workspace(c).replacePage(c.req.param('pageId'), input.body, input.ifRevision),
    )
  })
  api.patch('/pages/:pageId/title', async (c) => {
    const { title, ifRevision } = renamePageInput.parse(await c.req.json())
    return c.json(await workspace(c).renamePage(c.req.param('pageId'), title, ifRevision))
  })
  api.get('/pages/:pageId/history', async (c) =>
    c.json(await workspace(c).history(c.req.param('pageId'))),
  )
  api.get('/pages/:pageId/versions/:hash', async (c) =>
    c.json(await workspace(c).version(c.req.param('pageId'), c.req.param('hash'))),
  )
  api.delete('/pages/:pageId', async (c) => {
    await workspace(c).deletePage(c.req.param('pageId'), c.req.query('ifRevision'))
    return c.json({ ok: true })
  })
  api.post('/pages/:pageId/restore', async (c) => {
    const { hash, ifRevision } = restoreInput.parse(await c.req.json())
    return c.json(await workspace(c).restore(c.req.param('pageId'), hash, ifRevision))
  })
  api.get('/pages/:pageId/diff', async (c) =>
    c.json(
      await workspace(c).diff(c.req.param('pageId'), c.req.query('from') ?? '', c.req.query('to')),
    ),
  )
  api.get('/pages/:pageId/threads', async (c) =>
    c.json(await workspace(c).listPageThreads(c.req.param('pageId'))),
  )
  api.post('/pages/:pageId/threads', async (c) => {
    const { body, anchorText, context, to } = threadInput.parse(await c.req.json())
    const options = {
      ...(anchorText === undefined ? {} : { anchorText }),
      ...(context === undefined ? {} : { context }),
      ...(to === undefined ? {} : { to }),
    }
    return c.json(await workspace(c).createThread(c.req.param('pageId'), body, options), 201)
  })

  api.get('/threads', async (c) =>
    c.json(await workspace(c).listThreads(threadFilter.parse(c.req.query()))),
  )
  api.post('/threads/:threadId/replies', async (c) => {
    const { body } = replyInput.parse(await c.req.json())
    return c.json(await workspace(c).reply(c.req.param('threadId'), body), 201)
  })
  api.put('/threads/:threadId/messages/:messageId', async (c) => {
    const { body } = replyInput.parse(await c.req.json())
    return c.json(
      await workspace(c).editMessage(c.req.param('threadId'), c.req.param('messageId'), body),
    )
  })
  api.delete('/threads/:threadId/messages/:messageId', async (c) =>
    c.json(await workspace(c).deleteMessage(c.req.param('threadId'), c.req.param('messageId'))),
  )
  api.post('/threads/:threadId/reopen', async (c) =>
    c.json(await workspace(c).reopen(c.req.param('threadId'))),
  )
  api.post('/threads/:threadId/resolve', async (c) =>
    c.json(await workspace(c).resolve(c.req.param('threadId'))),
  )

  api.get('/search', (c) => {
    const { q, projectId, kinds, limit } = searchQuery.parse(c.req.query())
    return c.json({ results: workspace(c).search(q, { projectId, kinds, limit }) })
  })
  api.get('/events', (c) => c.json(workspace(c).events(eventsQuery.parse(c.req.query()))))
  api.get('/stream', (c) => {
    const scoped = workspace(c)
    return streamSSE(c, async (stream) => {
      const unsubscribe = scoped.subscribe((event) => {
        void stream.writeSSE({ event: 'store', id: event.id, data: JSON.stringify(event) })
      })
      const heartbeat = setInterval(() => {
        void stream.writeSSE({ event: 'ping', data: '' })
      }, HEARTBEAT_MS)
      await new Promise<void>((resolve) => stream.onAbort(resolve))
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  app.route('/api', api)
  return app
}
