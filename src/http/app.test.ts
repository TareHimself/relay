import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { adminClient, cleanupStores, client, json, tempStore } from '../test-support'

afterEach(cleanupStores)

describe('thread routes', () => {
  it('creates, replies to, lists and resolves threads', async () => {
    const store = await tempStore()
    const api = await adminClient(store)
    const project = await store.createProject('Alpha', '', 'tare')
    const page = await store.createPage(project.id, 'Plan', 'Ship the store', 'tare')

    const created = await api.send('POST', `/api/pages/${page.id}/threads`, {
      body: 'Is this realistic, @claude?',
      anchorText: 'Ship',
    })
    expect(created.status).toBe(201)
    const thread = await json<{ id: string; to: string[] }>(created)
    expect(thread.to).toEqual(['claude'])

    const ambiguous = await api.send('POST', `/api/pages/${page.id}/threads`, {
      body: 'Nope',
      anchorText: 'missing text',
    })
    expect(ambiguous.status).toBe(409)
    expect((await api.send('POST', `/api/pages/${page.id}/threads`, { body: ' ' })).status).toBe(
      400,
    )

    const open = await api.get('/api/threads?to=claude')
    expect((await json<unknown[]>(open)).length).toBe(1)

    const reply = await api.send('POST', `/api/threads/${thread.id}/replies`, { body: 'Yes' })
    expect(reply.status).toBe(201)
    const resolved = await api.send('POST', `/api/threads/${thread.id}/resolve`)
    expect((await json<{ status: string }>(resolved)).status).toBe('resolved')
    expect((await api.send('POST', '/api/threads/unknown/resolve')).status).toBe(404)
  })
})

describe('backup route', () => {
  it('streams a backup archive to the admin only, one at a time', async () => {
    const store = await tempStore()
    const admin = await adminClient(store)
    const project = await json<{ id: string }>(
      await admin.send('POST', '/api/projects', { name: 'Alpha' }),
    )
    await admin.send('POST', `/api/projects/${project.id}/pages`, { title: 'Plan', body: 'x' })
    const token = store.tokens.create({ name: 'claude', scope: 'write' }).token
    expect((await client(store, token).get('/api/backup')).status).toBe(403)

    const [first, second] = await Promise.all([admin.get('/api/backup'), admin.get('/api/backup')])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
    const ok = first.status === 200 ? first : second
    expect(ok.headers.get('content-type')).toBe('application/gzip')
    expect(ok.headers.get('content-disposition')).toMatch(
      /attachment; filename="relay-\d{8}-\d{6}\.tgz"/,
    )
    const bytes = Buffer.from(await ok.arrayBuffer())
    expect(Number(ok.headers.get('content-length'))).toBe(bytes.length)
    const tarball = gunzipSync(bytes).toString('latin1')
    expect(tarball).toContain('manifest.json')
    expect(tarball).toContain('"pages": 1')
    expect(tarball).toContain('repo.bundle')
  })
})
