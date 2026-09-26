import { afterEach, describe, expect, it } from 'vitest'
import { adminClient, cleanupStores, json, tempStore } from '../test-support'

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
