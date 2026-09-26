import { afterEach, describe, expect, it } from 'vitest'
import { adminClient, cleanupStores, client, json, tempStore } from '../test-support'

afterEach(cleanupStores)

async function setup() {
  const store = await tempStore()
  const admin = await adminClient(store)
  const alpha = await json(await admin.send('POST', '/api/projects', { name: 'Alpha' }))
  const beta = await json(await admin.send('POST', '/api/projects', { name: 'Beta' }))
  const page = await json(
    await admin.send('POST', `/api/projects/${alpha.id}/pages`, {
      title: 'Plan',
      body: '## Goals\n\nold goals\n\n## Risks\n\nold risks\n',
    }),
  )
  const betaPage = await json(
    await admin.send('POST', `/api/projects/${beta.id}/pages`, { title: 'Other', body: 'x' }),
  )
  const mint = async (input: Record<string, unknown>) =>
    (await json(await admin.send('POST', '/api/tokens', input))).token as string
  return { store, admin, alpha, beta, page, betaPage, mint }
}

describe('authentication', () => {
  it('requires a session or token and rejects bad tokens', async () => {
    const { store, admin } = await setup()
    expect(await json(await admin.get('/api/whoami'))).toEqual({
      handle: 'tare',
      displayName: 'tare',
      scope: 'write',
      projectId: null,
      kind: 'admin',
      session: true,
    })
    const anonymous = await client(store).get('/api/whoami')
    expect(anonymous.status).toBe(401)
    const bad = await client(store, 'rly_nope').get('/api/whoami')
    expect(bad.status).toBe(401)
    expect(bad.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('identifies a token by its name and keeps token management admin-only', async () => {
    const { store, mint } = await setup()
    const token = await mint({ name: 'claude' })
    const agent = client(store, token)
    expect(await json(await agent.get('/api/whoami'))).toMatchObject({
      handle: 'claude',
      kind: 'token',
    })
    expect((await agent.get('/api/tokens')).status).toBe(403)
    expect((await agent.send('POST', '/api/tokens', { name: 'other' })).status).toBe(403)
    expect((await agent.get('/api/problems')).status).toBe(403)
  })

  it('lists tokens without secrets and revokes them', async () => {
    const { store, admin, mint } = await setup()
    const token = await mint({ name: 'claude' })
    const [listed] = await json(await admin.get('/api/tokens'))
    expect(JSON.stringify(listed)).not.toContain(token)
    expect((await admin.send('DELETE', `/api/tokens/${listed.id}`)).status).toBe(200)
    expect((await client(store, token).get('/api/whoami')).status).toBe(401)
  })
})

describe('scopes and project restriction', () => {
  it('lets a write token edit and comment as itself', async () => {
    const { store, page, mint } = await setup()
    const agent = client(store, await mint({ name: 'claude' }))
    const thread = await json(
      await agent.send('POST', `/api/pages/${page.id}/threads`, {
        body: 'Question for @tare',
        anchorText: 'old goals',
      }),
    )
    expect(thread.messages[0].author).toBe('claude')
    expect(thread.to).toEqual(['tare'])
    const edited = await json(
      await agent.send('PATCH', `/api/pages/${page.id}`, {
        edits: [{ section: 'Risks', replace: 'new risks' }],
      }),
    )
    expect(edited.body).toContain('## Risks\n\nnew risks\n')
    const history = await json(await agent.get(`/api/pages/${page.id}/history`))
    expect(history[0].author).toBe('claude')
  })

  it('blocks writes for read-only tokens but allows reads', async () => {
    const { store, page, mint } = await setup()
    const reader = client(store, await mint({ name: 'reader', scope: 'read' }))
    expect((await reader.get(`/api/pages/${page.id}`)).status).toBe(200)
    expect(
      (
        await reader.send('PATCH', `/api/pages/${page.id}`, {
          edits: [{ find: 'old goals', replace: 'x' }],
        })
      ).status,
    ).toBe(403)
    expect(
      (await reader.send('POST', `/api/pages/${page.id}/threads`, { body: 'hi' })).status,
    ).toBe(403)
    expect((await reader.send('POST', '/api/projects', { name: 'Nope' })).status).toBe(403)
  })

  it('confines a project-restricted token to that project', async () => {
    const { store, alpha, beta, page, betaPage, mint } = await setup()
    const scoped = client(store, await mint({ name: 'alphaonly', projectId: alpha.id }))
    expect(
      (await json(await scoped.get('/api/projects'))).map((p: { id: string }) => p.id),
    ).toEqual([alpha.id])
    expect((await scoped.get(`/api/pages/${page.id}`)).status).toBe(200)
    expect((await scoped.get(`/api/pages/${betaPage.id}`)).status).toBe(403)
    expect((await scoped.get(`/api/projects/${beta.id}/pages`)).status).toBe(403)
    expect(
      (await scoped.send('POST', `/api/projects/${beta.id}/pages`, { title: 'x' })).status,
    ).toBe(403)
    expect((await scoped.get(`/api/threads?projectId=${beta.id}`)).status).toBe(403)
    expect((await scoped.send('POST', '/api/projects', { name: 'New' })).status).toBe(403)
  })
})

describe('page reads and diffs', () => {
  it('returns unchanged for a current sinceRevision', async () => {
    const { admin, page } = await setup()
    const current = await json(
      await admin.get(`/api/pages/${page.id}?sinceRevision=${page.revision}`),
    )
    expect(current).toEqual({ id: page.id, revision: page.revision, unchanged: true })
    const stale = await json(await admin.get(`/api/pages/${page.id}?sinceRevision=old`))
    expect(stale.body).toContain('old goals')
  })

  it('diffs two commits of a page', async () => {
    const { admin, page } = await setup()
    await admin.send('PATCH', `/api/pages/${page.id}`, {
      edits: [{ find: 'old goals', replace: 'shiny goals' }],
    })
    const history = await json(await admin.get(`/api/pages/${page.id}/history`))
    const diff = await json(
      await admin.get(`/api/pages/${page.id}/diff?from=${history[1].hash}&to=${history[0].hash}`),
    )
    expect(diff.diff).toContain('-old goals')
    expect(diff.diff).toContain('+shiny goals')
    expect((await admin.get(`/api/pages/${page.id}/diff?from=--exec`)).status).toBe(400)
  })
})

describe('events feed', () => {
  it('filters by type, actor, project and limit, and returns a next cursor', async () => {
    const { store, admin, alpha, page, mint } = await setup()
    const agent = client(store, await mint({ name: 'claude' }))
    await agent.send('POST', `/api/pages/${page.id}/threads`, {
      body: 'note',
      anchorText: 'old risks',
    })
    await admin.send('PATCH', `/api/pages/${page.id}`, {
      edits: [{ find: 'old goals', replace: 'x' }],
    })

    const all = await json(await admin.get('/api/events'))
    expect(all.events.length).toBeGreaterThanOrEqual(5)
    expect(all.next).toBe(all.events.at(-1).id)

    const comments = await json(
      await admin.get('/api/events?types=comment.created,comment.addressed'),
    )
    expect(comments.events.map((e: { type: string }) => e.type)).toEqual(['comment.created'])

    const others = await json(
      await admin.get('/api/events?excludeActor=claude&types=comment.created,page.updated'),
    )
    expect(others.events.map((e: { type: string }) => e.type)).toEqual(['page.updated'])

    const limited = await json(await admin.get('/api/events?limit=2'))
    expect(limited.events).toHaveLength(2)
    const rest = await json(await admin.get(`/api/events?since=${limited.next}`))
    expect(rest.events[0].id > limited.next).toBe(true)

    const future = await json(
      await admin.get(`/api/events?since=${new Date(Date.now() + 60_000).toISOString()}`),
    )
    expect(future.events).toEqual([])
    const past = await json(await admin.get('/api/events?since=2020-01-01T00:00:00Z'))
    expect(past.events.length).toBe(all.events.length)

    const scoped = client(store, await mint({ name: 'scoped', projectId: alpha.id }))
    expect((await scoped.get('/api/events?projectId=other')).status).toBe(403)
    const visible = (await json(await scoped.get('/api/events'))).events
    expect(visible.length).toBe(all.events.length - 2)
    expect(visible.every((e: { projectId: string }) => e.projectId === alpha.id)).toBe(true)
  })
})
