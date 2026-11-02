import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupStores, tempStore } from '../test-support'
import { RelayStore } from './relay-store'

afterEach(cleanupStores)

async function setup() {
  const store = await tempStore()
  const project = store.createProject('Alpha', '', 'tare')
  const page = store.createPage(project.id, 'Plan', 'v0', 'tare')
  return { store, page }
}

function save(store: RelayStore, id: string, body: string, actor = 'tare') {
  return store.replacePage(id, body, store.readPage(id).revision, actor)
}

const kinds = (store: RelayStore, id: string) => store.history(id).map((entry) => entry.kind)

async function withClock(run: (store: RelayStore, clock: { now: number }) => void) {
  const clock = { now: Date.now() }
  const directory = await fs.mkdtemp(join(tmpdir(), 'relay-test-'))
  const store = await RelayStore.open(directory, { now: () => clock.now })
  try {
    run(store, clock)
  } finally {
    store.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}

describe('autosave coalescing', () => {
  it('folds a burst of saves by one person into a single version', async () => {
    const { store, page } = await setup()
    save(store, page.id, 'v1\n')
    save(store, page.id, 'v2\n')
    save(store, page.id, 'v3\n')
    expect(kinds(store, page.id)).toEqual(['edit', 'create'])
    expect(store.readPage(page.id).body).toContain('v3')
    expect(store.readVersion(page.id, store.history(page.id)[0]!.id).body).toContain('v3')
  })

  it('keeps saves by different people, and agent edits, as separate versions', async () => {
    const { store, page } = await setup()
    save(store, page.id, 'human\n')
    save(store, page.id, 'someone else\n', 'rita')
    store.editPage(
      page.id,
      { edits: [{ find: 'someone else', replace: 'agent edit' }] },
      undefined,
      'tare',
    )
    expect(store.history(page.id)).toHaveLength(4)
  })

  it('starts a new version after the idle window', async () => {
    await withClock((store, clock) => {
      const project = store.createProject('Beta', '', 'tare')
      const page = store.createPage(project.id, 'Plan', 'v0', 'tare')
      save(store, page.id, 'v1\n')
      clock.now += 4 * 60 * 1000
      save(store, page.id, 'v2\n')
      expect(store.history(page.id)).toHaveLength(3)
    })
  })

  it('starts a new version after the maximum window even without a pause', async () => {
    await withClock((store, clock) => {
      const project = store.createProject('Beta', '', 'tare')
      const page = store.createPage(project.id, 'Plan', 'v0', 'tare')
      for (let minute = 0; minute <= 32; minute += 2) {
        save(store, page.id, `minute ${minute}\n`)
        clock.now += 2 * 60 * 1000
      }
      expect(store.history(page.id)).toHaveLength(3)
    })
  })

  it('drops a merged version when the text ends up back where it started', async () => {
    const { store, page } = await setup()
    const original = store.readPage(page.id).body
    save(store, page.id, 'v1\n')
    save(store, page.id, 'v2\n')
    save(store, page.id, original)
    expect(kinds(store, page.id)).toEqual(['create'])
    expect(store.readPage(page.id).body).toBe(original)
    save(store, page.id, 'v3\n')
    expect(store.history(page.id)).toHaveLength(2)
  })

  it('pages through history', async () => {
    const { store, page } = await setup()
    store.editPage(page.id, { body: 'a' }, undefined, 'tare')
    store.editPage(page.id, { body: 'b' }, undefined, 'tare')
    const all = store.history(page.id)
    expect(store.history(page.id, { limit: 1, offset: 1 })).toEqual([all[1]])
  })
})

describe('versions', () => {
  it('reads an earlier version exactly as it was saved', async () => {
    const { store, page } = await setup()
    store.editPage(page.id, { edits: [{ find: 'v0', replace: 'first' }] }, undefined, 'tare')
    store.editPage(page.id, { edits: [{ find: 'first', replace: 'second' }] }, undefined, 'claude')
    const history = store.history(page.id)
    expect(history).toHaveLength(3)
    expect(store.readVersion(page.id, history.at(-1)!.id).body).toBe('v0\n')
    expect(store.readVersion(page.id, history[1]!.id).body).toContain('first')
  })

  it('refuses a version from another page', async () => {
    const { store, page } = await setup()
    const other = store.createPage(page.projectId, 'Other', 'x', 'tare')
    const foreign = store.history(other.id)[0]!.id
    expect(() => store.readVersion(page.id, foreign)).toThrow(/not in this page history/)
    expect(() => store.readVersion(page.id, 'abcdef1')).toThrow(/not in this page history/)
    expect(() => store.diff(page.id, foreign)).toThrow(/not in this page history/)
  })

  it('restores an earlier version as a new one and keeps the old ones', async () => {
    const { store, page } = await setup()
    store.editPage(page.id, { edits: [{ find: 'v0', replace: 'first' }] }, undefined, 'tare')
    store.setTags(page.id, ['later'], undefined, 'tare')
    const history = store.history(page.id)
    const target = history.at(-1)!
    const latest = store.readPage(page.id)

    const restored = store.restoreVersion(page.id, target.id, latest.revision, 'tare')
    expect(restored.body).toBe('v0\n')
    expect(restored.tags).toEqual([])
    const after = store.history(page.id)
    expect(after).toHaveLength(history.length + 1)
    expect(after[0]?.kind).toBe('restore')
    expect(store.listEvents().at(-1)?.type).toBe('page.updated')
    expect(store.listEvents().at(-1)?.summary).toContain('Restored')
  })

  it('refuses a restore when the page changed since it was opened', async () => {
    const { store, page } = await setup()
    store.editPage(page.id, { body: 'first' }, undefined, 'tare')
    const stale = store.readPage(page.id).revision
    store.editPage(page.id, { body: 'second' }, undefined, 'tare')
    const target = store.history(page.id).at(-1)!.id
    expect(() => store.restoreVersion(page.id, target, stale, 'tare')).toThrow(/revision changed/)
  })

  it('refuses a restore whose old title now belongs to another page', async () => {
    const { store, page } = await setup()
    const oldest = store.history(page.id).at(-1)!.id
    const renamed = store.renamePage(page.id, 'Later', undefined, 'tare')
    store.createPage(page.projectId, 'Plan', 'taken', 'tare')
    expect(() => store.restoreVersion(page.id, oldest, renamed.revision, 'tare')).toThrow(
      /already exists/,
    )
  })

  it('does nothing when the chosen version equals the current text', async () => {
    const { store, page } = await setup()
    const current = store.readPage(page.id)
    const head = store.history(page.id)[0]!.id
    expect(store.restoreVersion(page.id, head, current.revision, 'tare').revision).toBe(
      current.revision,
    )
    expect(store.history(page.id)).toHaveLength(1)
  })

  it('makes a unified diff between versions and against the current text', async () => {
    const { store, page } = await setup()
    const first = store.history(page.id)[0]!.id
    store.editPage(page.id, { body: 'changed' }, undefined, 'tare')
    expect(store.diff(page.id, first)).toContain('+changed')
    expect(store.diff(page.id, first, store.history(page.id)[0]!.id)).toContain('-v0')
  })
})
