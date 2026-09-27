import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { cleanupStores, json, tempStore } from '../test-support'

const exec = promisify(execFile)

afterEach(cleanupStores)

const PASSWORD = 'correct horse battery'

async function secured() {
  const store = await tempStore()
  await store.accounts.bootstrapAdmin({ handle: 'tare', displayName: 'Tare B', password: PASSWORD })
  const app = createApp(store)
  const send = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.request(path, {
      method,
      headers: { 'content-type': 'application/json', host: 'relay.test', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const login = async (password = PASSWORD) => {
    const response = await send('POST', '/api/login', { password })
    const cookie = /relay_session=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1]
    return { response, cookie: cookie ? `relay_session=${cookie}` : '' }
  }
  return { store, app, send, login }
}

describe('sign-in', () => {
  it('locks the API once an admin exists, but keeps health and login reachable', async () => {
    const { send } = await secured()
    expect((await send('GET', '/api/health')).status).toBe(200)
    expect((await send('GET', '/api/projects')).status).toBe(401)
    expect((await send('GET', '/api/whoami')).status).toBe(401)
    expect((await send('POST', '/api/login', { password: PASSWORD })).status).toBe(200)
  })

  it('signs in with a hardened cookie and identifies the admin by handle', async () => {
    const { send, login } = await secured()
    const { response, cookie } = await login()
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).not.toContain('Secure')
    expect(await json(response)).toMatchObject({
      handle: 'tare',
      displayName: 'Tare B',
      session: true,
    })
    expect(await json(await send('GET', '/api/whoami', undefined, { cookie }))).toMatchObject({
      handle: 'tare',
      kind: 'admin',
      session: true,
    })
  })

  it('marks the cookie Secure over https', async () => {
    const { app } = await secured()
    const response = await app.request('https://relay.test/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD }),
    })
    expect(response.headers.get('set-cookie')).toContain('Secure')
  })

  it('rejects a wrong password and throttles repeated failures', async () => {
    const { send, login } = await secured()
    for (let i = 0; i < 5; i++) expect((await login('wrong password')).response.status).toBe(401)
    const blocked = await login(PASSWORD)
    expect(blocked.response.status).toBe(429)
    expect(Number(blocked.response.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await send('GET', '/api/projects')).status).toBe(401)
  })

  it('does everything as the signed-in handle and signs out for real', async () => {
    const { store, send, login } = await secured()
    const { cookie } = await login()
    const project = await json(await send('POST', '/api/projects', { name: 'Alpha' }, { cookie }))
    const page = await json(
      await send(
        'POST',
        `/api/projects/${project.id}/pages`,
        { title: 'Doc', body: 'hello' },
        { cookie },
      ),
    )
    const thread = await json(
      await send('POST', `/api/pages/${page.id}/threads`, { body: 'note' }, { cookie }),
    )
    expect(thread.messages[0].author).toBe('tare')

    expect((await send('POST', '/api/logout', undefined, { cookie })).status).toBe(200)
    expect((await send('GET', '/api/projects', undefined, { cookie })).status).toBe(401)
    expect(store.accounts.listSessions()).toEqual([])
  })

  it('refuses cross-origin writes made with a session cookie', async () => {
    const { send, login } = await secured()
    const { cookie } = await login()
    const evil = await send(
      'POST',
      '/api/projects',
      { name: 'X' },
      { cookie, origin: 'https://evil.test' },
    )
    expect(evil.status).toBe(403)
    const same = await send(
      'POST',
      '/api/projects',
      { name: 'X' },
      { cookie, origin: 'http://relay.test' },
    )
    expect(same.status).toBe(201)
  })

  it('still accepts API tokens, and tokens cannot use account routes', async () => {
    const { send, login, store } = await secured()
    const { cookie } = await login()
    const created = await json(await send('POST', '/api/tokens', { name: 'claude' }, { cookie }))
    const bearer = { authorization: `Bearer ${created.token}` }
    expect((await send('GET', '/api/whoami', undefined, bearer)).status).toBe(200)
    expect((await send('GET', '/api/sessions', undefined, bearer)).status).toBe(403)
    expect((await send('PATCH', '/api/account', { displayName: 'x' }, bearer)).status).toBe(403)
    expect(store.tokens.list()).toHaveLength(1)
  })

  it('reports that sign-in is disabled when no admin exists', async () => {
    const store = await tempStore()
    const response = await createApp(store).request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'whatever' }),
    })
    expect(response.status).toBe(400)
  })
})

describe('account management', () => {
  it('changes the password, keeps this session and signs the others out', async () => {
    const { send, login } = await secured()
    const first = await login()
    const second = await login()
    const wrong = await send(
      'POST',
      '/api/account/password',
      { current: 'nope nope', next: 'a new password!' },
      { cookie: first.cookie },
    )
    expect(wrong.status).toBe(403)
    const weak = await send(
      'POST',
      '/api/account/password',
      { current: PASSWORD, next: 'short' },
      { cookie: first.cookie },
    )
    expect(weak.status).toBe(400)
    const ok = await send(
      'POST',
      '/api/account/password',
      { current: PASSWORD, next: 'a new password!' },
      { cookie: first.cookie },
    )
    expect(ok.status).toBe(200)
    expect((await send('GET', '/api/whoami', undefined, { cookie: first.cookie })).status).toBe(200)
    expect((await send('GET', '/api/whoami', undefined, { cookie: second.cookie })).status).toBe(
      401,
    )
    expect((await login(PASSWORD)).response.status).toBe(401)
    expect((await login('a new password!')).response.status).toBe(200)
  })

  it('lists and revokes sessions', async () => {
    const { send, login } = await secured()
    const first = await login()
    const second = await login()
    const sessions = await json(
      await send('GET', '/api/sessions', undefined, { cookie: first.cookie }),
    )
    expect(sessions).toHaveLength(2)
    expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1)
    const other = sessions.find((s: { current: boolean }) => !s.current)
    expect(
      (await send('DELETE', `/api/sessions/${other.id}`, undefined, { cookie: first.cookie }))
        .status,
    ).toBe(200)
    expect((await send('GET', '/api/whoami', undefined, { cookie: second.cookie })).status).toBe(
      401,
    )
  })
})

describe('handles and display names', () => {
  it('shows a renamed display name for old commits without touching the commit email', async () => {
    const { store, send, login } = await secured()
    const { cookie } = await login()
    const project = await json(await send('POST', '/api/projects', { name: 'Alpha' }, { cookie }))
    const page = await json(
      await send(
        'POST',
        `/api/projects/${project.id}/pages`,
        { title: 'Doc', body: 'one' },
        { cookie },
      ),
    )
    const before = await json(
      await send('GET', `/api/pages/${page.id}/history`, undefined, { cookie }),
    )
    expect(before[0]).toMatchObject({ author: 'Tare B', handle: 'tare' })

    const renamed = await json(
      await send('PATCH', '/api/account', { displayName: 'Tare Belo' }, { cookie }),
    )
    expect(renamed.displayName).toBe('Tare Belo')
    await send(
      'PATCH',
      `/api/pages/${page.id}`,
      { edits: [{ find: 'one', replace: 'two' }] },
      { cookie },
    )

    const after = await json(
      await send('GET', `/api/pages/${page.id}/history`, undefined, { cookie }),
    )
    expect(after.map((entry: { author: string }) => entry.author)).toEqual([
      'Tare Belo',
      'Tare Belo',
    ])
    expect(after.every((entry: { handle: string }) => entry.handle === 'tare')).toBe(true)

    const repoDir = (store as unknown as { repoDir: string }).repoDir
    const raw = await exec('git', ['-C', repoDir, 'log', '--format=%an|%ae', '--no-mailmap'])
    expect(raw.stdout.trim().split('\n')).toEqual([
      'Tare Belo|tare@relay.local',
      'Tare B|tare@relay.local',
      'Tare B|tare@relay.local',
    ])
  })

  it('resolves display names in the people directory and blocks handle clashes', async () => {
    const { send, login, store } = await secured()
    const { cookie } = await login()
    expect(
      await json(await send('POST', '/api/tokens', { name: 'tare' }, { cookie })),
    ).toMatchObject({
      error: 'conflict',
    })
    await send('POST', '/api/tokens', { name: 'claude' }, { cookie })
    const people = await json(await send('GET', '/api/people', undefined, { cookie }))
    expect(people).toEqual([
      { handle: 'tare', displayName: 'Tare B', kind: 'user' },
      { handle: 'claude', displayName: 'claude', kind: 'agent' },
    ])
    store.tokens.create({ name: 'other' })
    await expect(
      store.accounts.bootstrapAdmin({ handle: 'x', password: 'long enough pw' }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })
})
