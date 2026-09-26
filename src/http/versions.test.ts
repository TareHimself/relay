import { afterEach, describe, expect, it } from 'vitest'
import { adminClient, cleanupStores, client, json, tempStore } from '../test-support'

afterEach(cleanupStores)

async function setup() {
  const store = await tempStore()
  const admin = await adminClient(store)
  const project = await json(await admin.send('POST', '/api/projects', { name: 'Alpha' }))
  const page = await json(
    await admin.send('POST', `/api/projects/${project.id}/pages`, { title: 'Plan', body: 'first' }),
  )
  await admin.send('PATCH', `/api/pages/${page.id}`, {
    edits: [{ find: 'first', replace: 'second' }],
    ifRevision: page.revision,
  })
  const history = await json(await admin.get(`/api/pages/${page.id}/history`))
  const current = await json(await admin.get(`/api/pages/${page.id}`))
  return { store, admin, page, history, current }
}

describe('version routes', () => {
  it('lists, reads and restores versions', async () => {
    const { admin, page, history, current } = await setup()
    expect(history).toHaveLength(2)
    const oldest = history.at(-1).hash

    const version = await json(await admin.get(`/api/pages/${page.id}/versions/${oldest}`))
    expect(version.hash).toBe(oldest)
    expect(version.body).toContain('first')

    const restored = await admin.send('POST', `/api/pages/${page.id}/restore`, {
      hash: oldest,
      ifRevision: current.revision,
    })
    expect(restored.status).toBe(200)
    expect((await json(restored)).body).toContain('first')
    const after = await json(await admin.get(`/api/pages/${page.id}/history`))
    expect(after).toHaveLength(3)
    expect(after[0].subject).toMatch(/^restore: /)
  })

  it('answers a stale restore with a conflict and a missing version with 404', async () => {
    const { admin, page, history } = await setup()
    const stale = await admin.send('POST', `/api/pages/${page.id}/restore`, {
      hash: history.at(-1).hash,
      ifRevision: 'not-the-revision',
    })
    expect(stale.status).toBe(409)
    expect((await admin.get(`/api/pages/${page.id}/versions/abcdef1`)).status).toBe(404)
  })

  it('lets a read-only token read versions but not restore them', async () => {
    const { store, admin, page, history, current } = await setup()
    const minted = await json(
      await admin.send('POST', '/api/tokens', { name: 'reader', scope: 'read' }),
    )
    const reader = client(store, minted.token)
    const oldest = history.at(-1).hash
    expect((await reader.get(`/api/pages/${page.id}/versions/${oldest}`)).status).toBe(200)
    const denied = await reader.send('POST', `/api/pages/${page.id}/restore`, {
      hash: oldest,
      ifRevision: current.revision,
    })
    expect(denied.status).toBe(403)
  })
})
