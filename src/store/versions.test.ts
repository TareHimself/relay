import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupStores, tempStore } from '../test-support'
import { RelayStore } from './relay-store'

const exec = promisify(execFile)

afterEach(cleanupStores)

const dirOf = (store: RelayStore) => (store as unknown as { repoDir: string }).repoDir

async function commitsFor(store: RelayStore, path: string): Promise<string[]> {
  const { stdout } = await exec('git', ['-C', dirOf(store), 'log', '--format=%s', '--', path])
  return stdout.trim().split('\n').filter(Boolean)
}

async function setup() {
  const store = await tempStore()
  const project = await store.createProject('Alpha', '', 'tare')
  const page = await store.createPage(project.id, 'Plan', 'v0', 'tare')
  return { store, page }
}

async function save(store: RelayStore, id: string, body: string, actor = 'tare') {
  const page = await store.readPage(id)
  return store.replacePage(id, body, page.revision, actor)
}

describe('autosave coalescing', () => {
  it('folds a burst of saves by one person into a single version', async () => {
    const { store, page } = await setup()
    await save(store, page.id, 'v1\n')
    await save(store, page.id, 'v2\n')
    await save(store, page.id, 'v3\n')
    expect(await commitsFor(store, page.path)).toEqual([
      `edit: ${page.path} (tare)`,
      `create: ${page.path} (tare)`,
    ])
    expect((await store.readPage(page.id)).body).toContain('v3')
    expect(await store.history(page.id)).toHaveLength(2)
  })

  it('keeps saves by different people, and agent edits, as separate versions', async () => {
    const { store, page } = await setup()
    await save(store, page.id, 'human\n')
    await save(store, page.id, 'someone else\n', 'rita')
    const current = await store.readPage(page.id)
    await store.editPage(
      page.id,
      { edits: [{ find: 'someone else', replace: 'agent edit' }] },
      current.revision,
      'tare',
    )
    expect(await commitsFor(store, page.path)).toHaveLength(4)
  })

  it('starts a new version after the idle window and after a commit to another file', async () => {
    const clock = { now: Date.now() }
    const seed = await tempStore()
    const store = await RelayStore.open(`${dirOf(seed)}-b`, { now: () => clock.now })
    try {
      const project = await store.createProject('Beta', '', 'tare')
      const page = await store.createPage(project.id, 'Plan', 'v0', 'tare')
      await save(store, page.id, 'v1\n')
      clock.now += 4 * 60 * 1000
      await save(store, page.id, 'v2\n')
      expect(await commitsFor(store, page.path)).toHaveLength(3)

      await store.threads.create(page.id, 'a comment', {}, 'tare')
      await save(store, page.id, 'v3\n')
      expect(await commitsFor(store, page.path)).toHaveLength(4)
    } finally {
      store.close()
    }
  })

  it('drops a merged version when the text ends up back where it started', async () => {
    const { store, page } = await setup()
    const original = (await store.readPage(page.id)).body
    await save(store, page.id, 'v1\n')
    await save(store, page.id, 'v2\n')
    const current = await store.readPage(page.id)

    await store.replacePage(page.id, original, current.revision, 'tare')

    expect(await commitsFor(store, page.path)).toEqual([`create: ${page.path} (tare)`])
    expect((await store.readPage(page.id)).body).toBe(original)
    expect(await exec('git', ['-C', dirOf(store), 'status', '--porcelain', '-uno'])).toMatchObject({
      stdout: '',
    })

    await save(store, page.id, 'v3\n')
    expect(await commitsFor(store, page.path)).toHaveLength(2)
    expect((await store.readPage(page.id)).body).toContain('v3')
  })

  it('records every merged save in the commit message so recovery can find it', async () => {
    const { store, page } = await setup()
    await save(store, page.id, 'v1\n')
    await save(store, page.id, 'v2\n')
    const { stdout } = await exec('git', ['-C', dirOf(store), 'log', '-1', '--format=%B'])
    expect(stdout.match(/Operation-ID: /g)).toHaveLength(2)
  })
})

describe('versions', () => {
  it('reads an earlier version exactly as it was saved', async () => {
    const { store, page } = await setup()
    await store.editPage(page.id, { edits: [{ find: 'v0', replace: 'first' }] }, undefined, 'tare')
    const current = await store.readPage(page.id)
    await store.editPage(
      page.id,
      { edits: [{ find: 'first', replace: 'second' }] },
      current.revision,
      'claude',
    )
    const history = await store.history(page.id)
    expect(history).toHaveLength(3)
    const original = await store.readVersion(page.id, history.at(-1)!.hash)
    expect(original.body).toContain('v0')
    expect(original.body.endsWith('\n')).toBe(true)
    const middle = await store.readVersion(page.id, history[1]!.hash.slice(0, 8))
    expect(middle.body).toContain('first')
  })

  it('rejects hashes that are not part of the page history', async () => {
    const { store, page } = await setup()
    await expect(store.readVersion(page.id, 'zzzzzzz')).rejects.toMatchObject({ code: 'invalid' })
    await expect(store.readVersion(page.id, 'abcdef1')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('restores an earlier version as a new one and keeps the old ones', async () => {
    const { store, page } = await setup()
    await store.editPage(page.id, { edits: [{ find: 'v0', replace: 'first' }] }, undefined, 'tare')
    const before = await store.readPage(page.id)
    await store.editPage(
      page.id,
      { edits: [{ find: 'first', replace: 'second' }] },
      before.revision,
      'tare',
    )
    const history = await store.history(page.id)
    const target = history.at(-1)!.hash
    const latest = await store.readPage(page.id)

    const restored = await store.restoreVersion(page.id, target, latest.revision, 'tare')
    expect(restored.body).toContain('v0')
    expect(restored.body).not.toContain('second')
    const after = await store.history(page.id)
    expect(after).toHaveLength(history.length + 1)
    expect(after[0]?.subject).toBe(`restore: ${page.path} (tare)`)
    expect(after.map((entry) => entry.hash)).toEqual(
      expect.arrayContaining(history.map((entry) => entry.hash)),
    )
    expect(store.listEvents().at(-1)).toMatchObject({
      type: 'page.updated',
      summary: `Restored version ${target.slice(0, 7)}`,
    })
  })

  it('refuses a restore when the page changed since it was opened', async () => {
    const { store, page } = await setup()
    await store.editPage(page.id, { edits: [{ find: 'v0', replace: 'first' }] }, undefined, 'tare')
    const stale = (await store.readPage(page.id)).revision
    await store.editPage(
      page.id,
      { edits: [{ find: 'first', replace: 'second' }] },
      undefined,
      'tare',
    )
    const target = (await store.history(page.id)).at(-1)!.hash
    await expect(store.restoreVersion(page.id, target, stale, 'tare')).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('does nothing when the chosen version equals the current text', async () => {
    const { store, page } = await setup()
    const current = await store.readPage(page.id)
    const head = (await store.history(page.id))[0]!.hash
    const same = await store.restoreVersion(page.id, head, current.revision, 'tare')
    expect(same.revision).toBe(current.revision)
    expect(await store.history(page.id)).toHaveLength(1)
  })
})
