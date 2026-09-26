import { afterEach, describe, expect, it } from 'vitest'
import { normalizeTag, normalizeTags } from '../shared/tags'
import { cleanupStores, tempStore } from '../test-support'
import { RelayStore } from './relay-store'
import { splitTagFilters } from './search'

afterEach(cleanupStores)

describe('normalizeTag', () => {
  it('makes lowercase slugs and keeps nesting', () => {
    expect(normalizeTag('  Game Engine ')).toBe('game-engine')
    expect(normalizeTag('Area / Search')).toBe('area/search')
    expect(normalizeTag('#Design!')).toBe('design')
    expect(normalizeTag('café')).toBe('café')
  })

  it('rejects empty and oversized tags, and dedupes lists', () => {
    expect(normalizeTag('  //  ')).toBeNull()
    expect(normalizeTag('x'.repeat(41))).toBeNull()
    expect(normalizeTags(['Design', 'design', ' ', 'Ops'])).toEqual(['design', 'ops'])
  })
})

describe('splitTagFilters', () => {
  it('pulls tag: terms out of the query text', () => {
    expect(splitTagFilters('tag:Design fibers tag:a/b')).toEqual({
      text: ' fibers ',
      tags: ['design', 'a/b'],
    })
    expect(splitTagFilters('untag:x')).toEqual({ text: 'untag:x', tags: [] })
  })
})

async function setup() {
  const store = await tempStore()
  const project = await store.createProject('Alpha', '', 'tare')
  const other = await store.createProject('Beta', '', 'tare')
  const page = await store.createPage(project.id, 'Fibers', 'Cooperative scheduling.', 'tare', [
    'Design',
    'area/engine',
  ])
  const plain = await store.createPage(project.id, 'Notes', 'Cooperative chat.', 'tare')
  const elsewhere = await store.createPage(other.id, 'Menu', 'Soup.', 'tare', ['design'])
  return { store, project, other, page, plain, elsewhere }
}

describe('page tags', () => {
  it('exposes normalized tags on pages and summaries', async () => {
    const { store, project, page } = await setup()
    expect(page.tags).toEqual(['design', 'area/engine'])
    expect(store.listPages(project.id).find((entry) => entry.id === page.id)?.tags).toEqual([
      'design',
      'area/engine',
    ])
  })

  it('replaces tags, keeping the rest of the frontmatter and the body', async () => {
    const { store, page } = await setup()
    const updated = await store.setTags(page.id, ['Ops', 'ops', 'Big Idea'], page.revision, 'tare')
    expect(updated.tags).toEqual(['ops', 'big-idea'])
    expect(updated).toMatchObject({ id: page.id, title: 'Fibers', body: page.body })
    expect((await store.readPage(page.id)).tags).toEqual(['ops', 'big-idea'])
  })

  it('clears tags and refuses a stale revision', async () => {
    const { store, page } = await setup()
    expect((await store.setTags(page.id, [], page.revision, 'tare')).tags).toEqual([])
    await expect(store.setTags(page.id, ['x'], page.revision, 'tare')).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('counts tags per project and across projects', async () => {
    const { store, project } = await setup()
    expect(store.listTags(project.id)).toEqual([
      { tag: 'area/engine', count: 1 },
      { tag: 'design', count: 1 },
    ])
    expect(store.listTags().find((entry) => entry.tag === 'design')?.count).toBe(2)
  })

  it('survives a restart and tolerates hand-edited tags', async () => {
    const { store, page } = await setup()
    store.close()
    const reopened = await RelayStore.open((store as unknown as { dataDir: string }).dataDir)
    try {
      expect(reopened.listTags().find((entry) => entry.tag === 'design')?.count).toBe(2)
      expect((await reopened.readPage(page.id)).tags).toEqual(['design', 'area/engine'])
      expect(reopened.search.query({ query: 'tag:area' }).map((hit) => hit.id)).toEqual([page.id])
    } finally {
      reopened.close()
    }
  })

  it('drops tags from removed pages', async () => {
    const { store, page, project } = await setup()
    await store.deletePage(page.id, undefined, 'tare')
    expect(store.listTags(project.id)).toEqual([])
  })
})

describe('tag search', () => {
  it('lists tagged pages for a bare tag: filter and includes nested tags', async () => {
    const { store, page, elsewhere } = await setup()
    expect(store.search.query({ query: 'tag:design' }).map((hit) => hit.id)).toEqual(
      expect.arrayContaining([page.id, elsewhere.id]),
    )
    expect(store.search.query({ query: 'tag:area' }).map((hit) => hit.id)).toEqual([page.id])
    expect(store.search.query({ query: 'tag:are' })).toEqual([])
  })

  it('combines a tag with text and a project filter', async () => {
    const { store, page, plain, project } = await setup()
    const ids = (query: string, projectId?: string) =>
      store.search.query({ query, projectId }).map((hit) => hit.id)
    expect(ids('cooperative tag:design')).toEqual([page.id])
    expect(ids('cooperative')).toEqual(expect.arrayContaining([page.id, plain.id]))
    expect(ids('tag:design', project.id)).toEqual([page.id])
  })

  it('follows tag changes', async () => {
    const { store, page } = await setup()
    await store.setTags(page.id, ['later'], undefined, 'tare')
    expect(store.search.query({ query: 'tag:later' }).map((hit) => hit.id)).toEqual([page.id])
    expect(store.search.query({ query: 'tag:area' })).toEqual([])
  })
})
