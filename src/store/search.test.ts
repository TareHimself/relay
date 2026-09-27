import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { adminClient, cleanupStores, client, json, tempStore } from '../test-support'
import { RelayStore } from './relay-store'
import { MARK_END, MARK_START, matchExpression } from './search'

afterEach(cleanupStores)

const topDirOf = (store: RelayStore) => (store as unknown as { dataDir: string }).dataDir

describe('matchExpression', () => {
  it('turns words into quoted terms with a prefix on the last one', () => {
    expect(matchExpression('job systems')).toBe('"job" "systems"*')
    expect(matchExpression('  fib ')).toBe('"fib"*')
  })

  it('drops everything that could be search syntax', () => {
    expect(matchExpression('a" OR "b* NEAR(c)')).toBe('"a" "OR" "b" "NEAR" "c"*')
    expect(matchExpression('"-:^()*')).toBeNull()
    expect(matchExpression('')).toBeNull()
  })

  it('keeps letters and numbers from any language', () => {
    expect(matchExpression('café 東京 v2')).toBe('"café" "東京" "v2"*')
  })
})

async function setup() {
  const store = await tempStore()
  const alpha = await store.createProject('Alpha', 'Game engine notes', 'tare')
  const beta = await store.createProject('Beta', 'Kitchen recipes', 'tare')
  const jobs = await store.createPage(
    alpha.id,
    'Job systems',
    'Work stealing deques let idle workers take tasks from busy ones.',
    'tare',
  )
  const soup = await store.createPage(beta.id, 'Soup', 'Simmer the onions slowly.', 'tare')
  const thread = await store.threads.create(
    jobs.id,
    'Please review the scheduler section.',
    { anchorText: 'idle workers' },
    'tare',
  )
  return { store, alpha, beta, jobs, soup, thread }
}

describe('search index', () => {
  it('finds pages, comments and projects, with prefix and stemmed matching', async () => {
    const { store, alpha, jobs, thread } = await setup()

    const pages = store.search.query({ query: 'stealing deques' })
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({
      kind: 'page',
      id: jobs.id,
      pageId: jobs.id,
      title: 'Job systems',
    })
    expect(pages[0]!.snippet).toContain(`${MARK_START}stealing${MARK_END}`)

    expect(store.search.query({ query: 'steal' }).map((hit) => hit.kind)).toEqual(['page'])

    const comments = store.search.query({ query: 'schedul' })
    expect(comments).toHaveLength(1)
    expect(comments[0]).toMatchObject({
      kind: 'thread',
      id: thread.id,
      pageId: jobs.id,
      title: 'Job systems',
    })

    expect(store.search.query({ query: 'kitchen' })).toEqual([
      expect.objectContaining({ kind: 'project', title: 'Beta', pageId: null }),
    ])
    expect(store.search.query({ query: 'engine' })[0]).toMatchObject({
      kind: 'project',
      id: alpha.id,
    })
  })

  it('ranks title matches above body matches', async () => {
    const { store, alpha } = await setup()
    await store.createPage(alpha.id, 'Notes', 'A note about job systems and scheduling.', 'tare')
    const hits = store.search.query({ query: 'job systems' }).filter((hit) => hit.kind === 'page')
    expect(hits.map((hit) => hit.title)).toEqual(['Job systems', 'Notes'])
  })

  it('filters by project and by kind, and limits the count', async () => {
    const { store, alpha, beta } = await setup()
    expect(
      store.search
        .query({ query: 'the', projectId: beta.id })
        .every((h) => h.projectId === beta.id),
    ).toBe(true)
    expect(store.search.query({ query: 'workers', projectId: beta.id })).toEqual([])
    expect(store.search.query({ query: 'review', kinds: ['page'] })).toEqual([])
    expect(store.search.query({ query: 'review', kinds: ['thread'] })).toHaveLength(1)
    expect(store.search.query({ query: 'a', projectId: alpha.id, limit: 1 })).toHaveLength(1)
  })

  it('follows edits, replies and deletions', async () => {
    const { store, jobs, thread } = await setup()

    const current = await store.readPage(jobs.id)
    await store.editPage(
      jobs.id,
      { edits: [{ find: 'Work stealing', replace: 'Lock free' }] },
      current.revision,
      'tare',
    )
    expect(store.search.query({ query: 'stealing' })).toEqual([])
    expect(store.search.query({ query: 'lock free' })[0]).toMatchObject({
      kind: 'page',
      id: jobs.id,
    })

    await store.threads.reply(thread.id, 'Added a hazard pointer paragraph.', 'claude')
    expect(store.search.query({ query: 'hazard' })[0]).toMatchObject({
      kind: 'thread',
      id: thread.id,
    })

    const first = (await store.threads.listForPage(jobs.id))[0]!.messages[0]!.id
    await store.threads.deleteMessage(thread.id, first, 'tare')
    expect(store.search.query({ query: 'review' })).toEqual([])
  })

  it('is rebuilt from the files when the index is empty', async () => {
    const { store, jobs, thread } = await setup()
    const dir = topDirOf(store)
    store.close()
    const db = new Database(join(dir, 'db', 'state.db'))
    db.exec('DELETE FROM search_index')
    db.close()

    const reopened = await RelayStore.open(dir)
    try {
      expect(reopened.search.query({ query: 'stealing' })[0]).toMatchObject({
        kind: 'page',
        id: jobs.id,
      })
      expect(reopened.search.query({ query: 'review' })[0]).toMatchObject({
        kind: 'thread',
        id: thread.id,
      })
      expect(reopened.search.query({ query: 'kitchen' })[0]).toMatchObject({ kind: 'project' })
    } finally {
      reopened.close()
    }
  })

  it('returns nothing for an empty or symbols-only query', async () => {
    const { store } = await setup()
    expect(store.search.query({ query: '' })).toEqual([])
    expect(store.search.query({ query: '"*()' })).toEqual([])
  })
})

describe('search route', () => {
  it('answers signed-in searches and hides other projects from restricted tokens', async () => {
    const { store, alpha } = await setup()
    const admin = await adminClient(store)

    const found = await json(await admin.get('/api/search?q=stealing'))
    expect(found.results).toHaveLength(1)
    expect((await json(await admin.get('/api/search?q='))).results).toEqual([])

    const minted = await json(
      await admin.send('POST', '/api/tokens', {
        name: 'scoped',
        scope: 'read',
        projectId: alpha.id,
      }),
    )
    const scoped = client(store, minted.token)
    expect((await json(await scoped.get('/api/search?q=simmer'))).results).toEqual([])
    expect((await json(await scoped.get('/api/search?q=stealing'))).results).toHaveLength(1)
    expect((await scoped.get(`/api/search?q=simmer&projectId=${alpha.id}`)).status).toBe(200)
    expect((await client(store).get('/api/search?q=x')).status).toBe(401)
  })
})
