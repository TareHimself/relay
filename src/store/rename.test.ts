import { afterEach, describe, expect, it } from 'vitest'
import { cleanupStores, tempStore } from '../test-support'

afterEach(cleanupStores)

async function setup() {
  const store = await tempStore()
  const project = store.createProject('Alpha', '', 'tare')
  const page = store.createPage(project.id, 'Original Title', 'Some body text.', 'tare')
  return { store, project, page }
}

describe('renamePage', () => {
  it('changes the title and keeps id, body, history and threads', async () => {
    const { store, project, page } = await setup()
    store.threads.create(page.id, 'A comment', { anchorText: 'body' }, 'tare')

    const renamed = store.renamePage(page.id, 'New Title', page.revision, 'tare')

    expect(renamed).toMatchObject({ id: page.id, title: 'New Title' })
    expect(renamed.body).toContain('Some body text.')
    expect(store.listPages(project.id).map((p) => p.title)).toEqual(['New Title'])
    expect(store.threads.listForPage(page.id)).toHaveLength(1)
    expect(store.history(page.id).map((entry) => entry.kind)).toEqual(['rename', 'create'])
  })

  it('updates the search index', async () => {
    const { store, page } = await setup()
    expect(store.search.query({ query: 'original' })).toHaveLength(1)
    store.renamePage(page.id, 'Renamed Doc', page.revision, 'tare')
    expect(store.search.query({ query: 'original' })).toEqual([])
    expect(store.search.query({ query: 'renamed' })[0]).toMatchObject({ id: page.id })
  })

  it('allows a change of case', async () => {
    const { store, page } = await setup()
    expect(store.renamePage(page.id, 'original title', page.revision, 'tare').title).toBe(
      'original title',
    )
  })

  it('is a no-op when the title is unchanged', async () => {
    const { store, page } = await setup()
    expect(store.renamePage(page.id, 'Original Title', page.revision, 'tare')).toEqual(page)
    expect(store.history(page.id)).toHaveLength(1)
  })

  it('refuses an empty title, a stale revision and a taken title', async () => {
    const { store, project, page } = await setup()
    expect(() => store.renamePage(page.id, '   ', undefined, 'tare')).toThrow(/empty/)
    expect(() => store.renamePage(page.id, 'New', 'not-current', 'tare')).toThrow(/revision/)
    store.createPage(project.id, 'Taken', 'Other body.', 'tare')
    expect(() => store.renamePage(page.id, 'Taken', page.revision, 'tare')).toThrow(
      /already exists/,
    )
    expect(store.readPage(page.id).title).toBe('Original Title')
  })
})

describe('createProject', () => {
  it('accepts the name that used to collide with the blob folder', async () => {
    const store = await tempStore()
    expect(store.createProject('Blobs', '', 'tare').name).toBe('Blobs')
  })

  it('refuses a duplicate name', async () => {
    const { store } = await setup()
    expect(() => store.createProject('alpha', '', 'tare')).toThrow(/already exists/)
  })
})

describe('project changes', () => {
  it('renames, and ignores an unchanged name', async () => {
    const { store, project } = await setup()
    const before = store.listEvents().length
    store.renameProject(project.id, 'Alpha', 'tare')
    expect(store.listEvents()).toHaveLength(before)
    expect(store.renameProject(project.id, 'Beta', 'tare')).toMatchObject({ name: 'Beta' })
    expect(store.listProjects().map((p) => p.name)).toEqual(['Beta'])
  })

  it('sets and clears the description', async () => {
    const { store, project } = await setup()
    const updated = store.setProjectDescription(project.id, 'A scratch project', 'tare')
    expect(updated).toEqual({ id: project.id, name: 'Alpha', description: 'A scratch project' })
    expect(store.setProjectDescription(project.id, '', 'tare').description).toBe('')
  })

  it('refuses an empty name and an unknown project', async () => {
    const { store, project } = await setup()
    expect(() => store.renameProject(project.id, '  ', 'tare')).toThrow(/empty/)
    expect(() => store.renameProject('nope', 'X', 'tare')).toThrow(/not found/)
    expect(() => store.setProjectDescription('nope', 'X', 'tare')).toThrow(/not found/)
  })
})
