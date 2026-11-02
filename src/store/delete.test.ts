import { afterEach, describe, expect, it } from 'vitest'
import { adminClient, cleanupStores, client, json, tempStore } from '../test-support'

afterEach(cleanupStores)

async function setup() {
  const store = await tempStore()
  const project = store.createProject('Alpha', '', 'tare')
  const page = store.createPage(project.id, 'Doomed', 'Remove me please.', 'tare')
  const keep = store.createPage(project.id, 'Keeper', 'Stay here.', 'tare')
  return { store, project, page, keep }
}

describe('deletePage', () => {
  it('hides the page, its comments and its index entries, and records the delete', async () => {
    const { store, project, page, keep } = await setup()
    store.threads.create(page.id, 'A comment', { anchorText: 'Remove' }, 'tare')

    store.deletePage(page.id, undefined, 'tare')

    expect(() => store.readPage(page.id)).toThrow('Page not found')
    expect(store.listPages(project.id).map((entry) => entry.id)).toEqual([keep.id])
    expect(store.threads.list()).toEqual([])
    expect(store.search.query({ query: 'remove' })).toEqual([])
    expect(store.search.query({ query: 'comment' })).toEqual([])
    expect(store.search.query({ query: 'stay' })).toHaveLength(1)
    expect(store.listEvents().at(-1)).toMatchObject({
      type: 'page.deleted',
      pageId: page.id,
      summary: 'Doomed',
    })
  })

  it('keeps the rows so a deleted page can be recovered', async () => {
    const { store, page } = await setup()
    store.deletePage(page.id, undefined, 'tare')
    const versions = store.database
      .prepare('SELECT kind, body FROM page_versions WHERE page_id = ? ORDER BY id')
      .all(page.id) as { kind: string; body: string }[]
    expect(versions.map((version) => version.kind)).toEqual(['create', 'delete'])
    expect(versions[0]?.body).toContain('Remove me please.')
  })

  it('frees the title for a new page', async () => {
    const { store, project, page } = await setup()
    store.deletePage(page.id, undefined, 'tare')
    expect(store.createPage(project.id, 'Doomed', 'Again', 'tare').id).not.toBe(page.id)
  })

  it('refuses a delete when the page changed since it was read', async () => {
    const { store, page } = await setup()
    store.editPage(
      page.id,
      { edits: [{ find: 'Remove me', replace: 'Keep me' }] },
      undefined,
      'tare',
    )
    expect(() => store.deletePage(page.id, page.revision, 'tare')).toThrow(/revision changed/)
    expect(store.readPage(page.id).body).toContain('Keep me')
  })
})

describe('delete route', () => {
  it('deletes for a signed-in admin and a write token, but not for a read-only token', async () => {
    const { store, page, keep } = await setup()
    const admin = await adminClient(store)
    const reader = client(
      store,
      (await json(await admin.send('POST', '/api/tokens', { name: 'reader', scope: 'read' })))
        .token,
    )
    expect((await reader.send('DELETE', `/api/pages/${page.id}`)).status).toBe(403)
    expect((await admin.get(`/api/pages/${page.id}`)).status).toBe(200)

    const stale = await admin.send('DELETE', `/api/pages/${page.id}?ifRevision=not-current`)
    expect(stale.status).toBe(409)

    const deleted = await admin.send('DELETE', `/api/pages/${page.id}`)
    expect(deleted.status).toBe(200)
    expect((await admin.get(`/api/pages/${page.id}`)).status).toBe(404)
    expect((await admin.send('DELETE', `/api/pages/${page.id}`)).status).toBe(404)
    expect((await admin.get(`/api/pages/${keep.id}`)).status).toBe(200)
  })
})
