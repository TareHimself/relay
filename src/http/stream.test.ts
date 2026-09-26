import { afterEach, describe, expect, it } from 'vitest'
import { adminClient, cleanupStores, client, json, tempStore } from '../test-support'

afterEach(cleanupStores)

async function readEvents(response: Response, count: number): Promise<Array<{ type: string }>> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const events: Array<{ type: string }> = []
  let buffer = ''
  while (events.length < count) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value)
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const data = /^data: (.*)$/m.exec(frame)?.[1]
      if (frame.includes('event: store') && data) events.push(JSON.parse(data))
    }
  }
  await reader.cancel()
  return events
}

describe('event stream', () => {
  it('pushes events to a signed-in client after the write is visible', async () => {
    const store = await tempStore()
    const admin = await adminClient(store)
    const response = await admin.get('/api/stream')
    expect(response.headers.get('content-type')).toContain('text/event-stream')

    const pending = readEvents(response, 2)
    const created = await json(await admin.send('POST', '/api/projects', { name: 'Alpha' }))
    await admin.send('POST', `/api/projects/${created.id}/pages`, { title: 'Plan', body: 'x' })

    const events = await pending
    expect(events.map((event) => event.type)).toEqual(['project.created', 'page.created'])
    expect(store.listProjects().map((project) => project.id)).toContain(created.id)
  })

  it('rejects anonymous streams', async () => {
    const store = await tempStore()
    await adminClient(store)
    expect((await client(store).get('/api/stream')).status).toBe(401)
  })

  it('only sends a restricted token events for its own project', async () => {
    const store = await tempStore()
    const admin = await adminClient(store)
    const alpha = await json(await admin.send('POST', '/api/projects', { name: 'Alpha' }))
    const beta = await json(await admin.send('POST', '/api/projects', { name: 'Beta' }))
    const minted = await json(
      await admin.send('POST', '/api/tokens', {
        name: 'scoped',
        scope: 'read',
        projectId: alpha.id,
      }),
    )
    const scoped = client(store, minted.token)
    const response = await scoped.get('/api/stream')

    const pending = readEvents(response, 1)
    await admin.send('POST', `/api/projects/${beta.id}/pages`, { title: 'Hidden', body: 'x' })
    await admin.send('POST', `/api/projects/${alpha.id}/pages`, { title: 'Visible', body: 'x' })

    const [event] = await pending
    expect(event).toMatchObject({ type: 'page.created', projectId: alpha.id })
  })
})
