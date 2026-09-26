import Database from 'better-sqlite3'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { adminClient, cleanupStores, client, json, tempStore } from '../test-support'
import { newId } from '../core/ids'
import { RelayStore } from './relay-store'

const exec = promisify(execFile)

afterEach(cleanupStores)

const dirOf = (store: RelayStore) => (store as unknown as { dataDir: string }).dataDir
const git = async (store: RelayStore, ...args: string[]) =>
  (await exec('git', ['-C', dirOf(store), ...args])).stdout.trim()

async function setup() {
  const store = await tempStore()
  const project = await store.createProject('Alpha', '', 'tare')
  const page = await store.createPage(project.id, 'Doomed', 'Remove me please.', 'tare')
  const keep = await store.createPage(project.id, 'Keeper', 'Stay here.', 'tare')
  return { store, project, page, keep }
}

describe('deletePage', () => {
  it('removes the page, its comments and its index entries, and records the delete', async () => {
    const { store, project, page, keep } = await setup()
    await store.threads.create(page.id, 'A comment', { anchorText: 'Remove' }, 'tare')
    const dir = dirOf(store)

    await store.deletePage(page.id, undefined, 'tare')

    expect(existsSync(join(dir, page.path))).toBe(false)
    expect(existsSync(join(dir, page.path.replace(/\.md$/, '.threads.json')))).toBe(false)
    await expect(store.readPage(page.id)).rejects.toMatchObject({ code: 'not_found' })
    expect(store.listPages(project.id).map((entry) => entry.id)).toEqual([keep.id])
    expect(await store.threads.list()).toEqual([])
    expect(store.search.query({ query: 'remove' })).toEqual([])
    expect(store.search.query({ query: 'comment' })).toEqual([])
    expect(store.search.query({ query: 'stay' })).toHaveLength(1)

    expect(await git(store, 'log', '-1', '--format=%s')).toBe(`delete: ${page.path} (tare)`)
    expect(await git(store, 'status', '--porcelain', '--untracked-files=no')).toBe('')
    expect(store.listEvents().at(-1)).toMatchObject({
      type: 'page.deleted',
      pageId: page.id,
      summary: 'Doomed',
    })
  })

  it('keeps the whole history in git so a deleted page can be recovered', async () => {
    const { store, page } = await setup()
    await store.deletePage(page.id, undefined, 'tare')
    const created = await git(store, 'log', '--diff-filter=A', '--format=%H', '--', page.path)
    const content = await git(store, 'show', `${created}:${page.path}`)
    expect(content).toContain('Remove me please.')
  })

  it('works for a page that never had comments', async () => {
    const { store, page } = await setup()
    await store.deletePage(page.id, undefined, 'tare')
    await expect(store.readPage(page.id)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('refuses a delete when the page changed since it was read', async () => {
    const { store, page } = await setup()
    const stale = page.revision
    await store.editPage(
      page.id,
      { edits: [{ find: 'Remove me', replace: 'Keep me' }] },
      undefined,
      'tare',
    )
    await expect(store.deletePage(page.id, stale, 'tare')).rejects.toMatchObject({
      code: 'conflict',
    })
    expect((await store.readPage(page.id)).body).toContain('Keep me')
  })

  it('finishes a delete that was interrupted before the commit', async () => {
    const { store, project, page, keep } = await setup()
    const dir = dirOf(store)
    const expected = readFileSync(join(dir, page.path), 'utf8')
    store.close()

    const db = new Database(join(dir, 'state.db'))
    const event = {
      id: newId(),
      type: 'page.deleted',
      at: new Date().toISOString(),
      actor: 'tare',
      projectId: project.id,
      pageId: page.id,
      summary: 'Doomed',
    }
    db.prepare(
      'INSERT INTO operations (id, path, expected, content, actor, event, deleted, status) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    ).run(newId(), page.path, expected, '', 'tare', JSON.stringify([event]), 'pending')
    db.close()

    const reopened = await RelayStore.open(dir)
    try {
      await expect(reopened.readPage(page.id)).rejects.toMatchObject({ code: 'not_found' })
      expect((await reopened.readPage(keep.id)).title).toBe('Keeper')
      expect(existsSync(join(dir, page.path))).toBe(false)
      expect(await git(reopened, 'log', '-1', '--format=%s')).toBe(`delete: ${page.path} (tare)`)
    } finally {
      reopened.close()
    }
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
