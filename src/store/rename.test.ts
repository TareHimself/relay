import Database from 'better-sqlite3'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { newId } from '../core/ids'
import { cleanupStores, tempStore } from '../test-support'
import { RelayStore } from './relay-store'

const exec = promisify(execFile)

afterEach(cleanupStores)

const dirOf = (store: RelayStore) => (store as unknown as { repoDir: string }).repoDir
const topDirOf = (store: RelayStore) => (store as unknown as { dataDir: string }).dataDir
const git = async (store: RelayStore, ...args: string[]) =>
  (await exec('git', ['-C', dirOf(store), ...args])).stdout.trim()

async function setup() {
  const store = await tempStore()
  const project = await store.createProject('Alpha', '', 'tare')
  const page = await store.createPage(project.id, 'Original Title', 'Some body text.', 'tare')
  return { store, project, page }
}

describe('renamePage', () => {
  it('moves the file and its threads file when the slug changes, keeping history', async () => {
    const { store, project, page } = await setup()
    await store.threads.create(page.id, 'A comment', { anchorText: 'body' }, 'tare')
    const dir = dirOf(store)
    const oldPath = page.path
    const oldThreads = oldPath.replace(/\.md$/, '.threads.json')

    const renamed = await store.renamePage(page.id, 'New Title', page.revision, 'tare')

    expect(renamed.id).toBe(page.id)
    expect(renamed.title).toBe('New Title')
    expect(renamed.path).toBe('alpha/new-title.md')
    expect(renamed.body).toContain('Some body text.')
    expect(existsSync(join(dir, oldPath))).toBe(false)
    expect(existsSync(join(dir, oldThreads))).toBe(false)
    expect(existsSync(join(dir, renamed.path))).toBe(true)
    expect(existsSync(join(dir, renamed.path.replace(/\.md$/, '.threads.json')))).toBe(true)

    const fresh = await store.readPage(page.id)
    expect(fresh.title).toBe('New Title')
    expect(fresh.path).toBe(renamed.path)
    expect(store.listPages(project.id).map((p) => p.title)).toEqual(['New Title'])
    expect(await store.threads.listForPage(page.id)).toHaveLength(1)

    expect(await git(store, 'log', '-1', '--format=%s')).toBe(
      `rename: ${oldPath} -> ${renamed.path} (tare)`,
    )
    expect(await git(store, 'status', '--porcelain', '--untracked-files=no')).toBe('')
    const history = await git(store, 'log', '--follow', '--format=%H', '--', renamed.path)
    expect(history.split('\n')).toHaveLength(2)
  })

  it('updates the search index to the new path and title', async () => {
    const { store, page } = await setup()
    expect(store.search.query({ query: 'original' })).toHaveLength(1)
    await store.renamePage(page.id, 'Renamed Doc', page.revision, 'tare')
    expect(store.search.query({ query: 'original' })).toEqual([])
    expect(store.search.query({ query: 'renamed' })[0]).toMatchObject({ id: page.id })
  })

  it('just updates the frontmatter title when the slug is unchanged', async () => {
    const { store, page } = await setup()
    const oldPath = page.path
    const renamed = await store.renamePage(page.id, 'original title', page.revision, 'tare')
    expect(renamed.path).toBe(oldPath)
    expect(renamed.title).toBe('original title')
    expect(await git(store, 'log', '-1', '--format=%s')).toBe(`edit: ${oldPath} (tare)`)
  })

  it('is a no-op when the title is unchanged', async () => {
    const { store, page } = await setup()
    const before = await git(store, 'rev-parse', 'HEAD')
    const result = await store.renamePage(page.id, 'Original Title', page.revision, 'tare')
    expect(result).toEqual(page)
    expect(await git(store, 'rev-parse', 'HEAD')).toBe(before)
  })

  it('refuses an empty title', async () => {
    const { store, page } = await setup()
    await expect(store.renamePage(page.id, '   ', undefined, 'tare')).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('refuses a stale revision', async () => {
    const { store, page } = await setup()
    await expect(
      store.renamePage(page.id, 'New Title', 'not-current', 'tare'),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('refuses to rename onto an existing page slug', async () => {
    const { store, project, page } = await setup()
    await store.createPage(project.id, 'Taken', 'Other body.', 'tare')
    await expect(store.renamePage(page.id, 'Taken', page.revision, 'tare')).rejects.toMatchObject({
      code: 'conflict',
    })
    expect((await store.readPage(page.id)).title).toBe('Original Title')
  })

  it('finishes a rename that was interrupted before the commit', async () => {
    const { store, project, page } = await setup()
    await store.threads.create(page.id, 'A comment', { anchorText: 'body' }, 'tare')
    const dir = dirOf(store)
    const topDir = topDirOf(store)
    const oldPath = page.path
    const oldThreads = oldPath.replace(/\.md$/, '.threads.json')
    const expected = readFileSync(join(dir, oldPath), 'utf8')
    const newPath = `${page.path.split('/')[0]}/new-title.md`
    const content = expected.replace('title: Original Title', 'title: New Title')
    store.close()

    const db = new Database(join(topDir, 'db', 'state.db'))
    const event = {
      id: newId(),
      type: 'page.updated',
      at: new Date().toISOString(),
      actor: 'tare',
      projectId: project.id,
      pageId: page.id,
      revision: 'irrelevant-for-recovery',
      summary: 'Renamed to "New Title"',
    }
    db.prepare(
      'INSERT INTO operations (id, path, expected, content, actor, event, rename_from, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(newId(), newPath, expected, content, 'tare', JSON.stringify([event]), oldPath, 'pending')
    db.close()

    const reopened = await RelayStore.open(topDir)
    try {
      const moved = await reopened.readPage(page.id)
      expect(moved.title).toBe('New Title')
      expect(moved.path).toBe(newPath)
      expect(existsSync(join(dir, oldPath))).toBe(false)
      expect(existsSync(join(dir, oldThreads))).toBe(false)
      expect(existsSync(join(dir, newPath))).toBe(true)
      expect(existsSync(join(dir, newPath.replace(/\.md$/, '.threads.json')))).toBe(true)
      expect(await git(reopened, 'log', '-1', '--format=%s')).toBe(
        `rename: ${oldPath} -> ${newPath} (tare)`,
      )
      expect(await git(reopened, 'status', '--porcelain', '--untracked-files=no')).toBe('')
    } finally {
      reopened.close()
    }
  })
})

describe('renameProject', () => {
  it('changes the display name without moving any files', async () => {
    const { store, project, page } = await setup()
    const renamed = await store.renameProject(project.id, 'Beta', 'tare')
    expect(renamed).toMatchObject({ id: project.id, name: 'Beta' })
    expect(store.listProjects().map((p) => p.name)).toEqual(['Beta'])
    expect((await store.readPage(page.id)).path).toBe(page.path)
    expect(await git(store, 'log', '-1', '--format=%s')).toBe(
      `edit: ${page.path.split('/')[0]}/project.yaml (tare)`,
    )
  })

  it('is a no-op when the name is unchanged', async () => {
    const { store, project } = await setup()
    const before = await git(store, 'rev-parse', 'HEAD')
    await store.renameProject(project.id, 'Alpha', 'tare')
    expect(await git(store, 'rev-parse', 'HEAD')).toBe(before)
  })

  it('refuses an empty name', async () => {
    const { store, project } = await setup()
    await expect(store.renameProject(project.id, '  ', 'tare')).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('rejects an unknown project', async () => {
    const { store } = await setup()
    await expect(store.renameProject('nope', 'X', 'tare')).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

describe('setProjectDescription', () => {
  it('changes the description without touching the name or any files', async () => {
    const { store, project, page } = await setup()
    const updated = await store.setProjectDescription(project.id, 'A scratch project', 'tare')
    expect(updated).toEqual({ id: project.id, name: 'Alpha', description: 'A scratch project' })
    expect(store.listProjects()).toContainEqual(updated)
    expect((await store.readPage(page.id)).path).toBe(page.path)
  })

  it('accepts clearing the description back to empty', async () => {
    const { store, project } = await setup()
    await store.setProjectDescription(project.id, 'Something', 'tare')
    const cleared = await store.setProjectDescription(project.id, '', 'tare')
    expect(cleared.description).toBe('')
  })

  it('is a no-op when the description is unchanged', async () => {
    const { store, project } = await setup()
    const before = await git(store, 'rev-parse', 'HEAD')
    await store.setProjectDescription(project.id, '', 'tare')
    expect(await git(store, 'rev-parse', 'HEAD')).toBe(before)
  })

  it('rejects an unknown project', async () => {
    const { store } = await setup()
    await expect(store.setProjectDescription('nope', 'X', 'tare')).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
