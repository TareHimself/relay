import { afterEach, describe, expect, it } from 'vitest'
import { cleanupStores, tempStore } from '../test-support'
import { thinHistory } from './history'
import type { RelayStore } from './relay-store'

afterEach(cleanupStores)

const DAY = 86_400_000
const NOW = Date.parse('2026-11-01T12:00:00Z')
const OPTIONS = { keepAllDays: 7, keepDailyDays: 90, now: NOW }

function ageVersions(store: RelayStore, pageId: string, stamps: readonly number[]) {
  const rows = store.database
    .prepare('SELECT id FROM page_versions WHERE page_id = ? ORDER BY id')
    .all(pageId) as { id: string }[]
  rows.forEach((row, index) => {
    const at = new Date(stamps[index]!).toISOString()
    store.database
      .prepare('UPDATE page_versions SET created_at = ?, updated_at = ? WHERE id = ?')
      .run(at, at, row.id)
  })
}

async function pageWith(edits: number) {
  const store = await tempStore()
  const project = store.createProject('Alpha', '', 'tare')
  const page = store.createPage(project.id, 'Plan', 'v0', 'tare')
  for (let n = 1; n <= edits; n++) store.editPage(page.id, { body: `v${n}` }, undefined, 'tare')
  return { store, page }
}

describe('thinHistory', () => {
  it('keeps recent versions, the first and the newest', async () => {
    const { store, page } = await pageWith(3)
    ageVersions(store, page.id, [NOW - 400 * DAY, NOW - 2 * DAY, NOW - DAY, NOW])
    expect(thinHistory(store.database, OPTIONS)).toEqual({ candidates: 0, deleted: 0 })
  })

  it('keeps the last version per person per day after the first week', async () => {
    const { store, page } = await pageWith(4)
    const day = NOW - 20 * DAY
    ageVersions(store, page.id, [NOW - 30 * DAY, day, day + 1000, day + 2000, NOW])
    expect(thinHistory(store.database, OPTIONS).deleted).toBe(2)
    expect(store.history(page.id).map((entry) => entry.kind)).toEqual(['edit', 'edit', 'create'])
    const kept = store.history(page.id)[1]!.id
    expect(store.readVersion(page.id, kept).body).toBe('v3\n')
  })

  it('keeps one version per week after the daily window', async () => {
    const { store, page } = await pageWith(4)
    const monday = Date.parse('2026-03-02T09:00:00Z')
    ageVersions(store, page.id, [monday - 30 * DAY, monday, monday + DAY, monday + 2 * DAY, NOW])
    expect(thinHistory(store.database, OPTIONS).deleted).toBe(2)
  })

  it('does not merge different people', async () => {
    const { store, page } = await pageWith(1)
    store.editPage(page.id, { body: 'other' }, undefined, 'rita')
    store.editPage(page.id, { body: 'last' }, undefined, 'tare')
    const day = NOW - 20 * DAY
    ageVersions(store, page.id, [NOW - 30 * DAY, day, day + 1000, NOW])
    expect(thinHistory(store.database, OPTIONS).deleted).toBe(0)
  })

  it('never removes renames, tag changes or restores', async () => {
    const { store, page } = await pageWith(0)
    store.renamePage(page.id, 'New', undefined, 'tare')
    store.setTags(page.id, ['x'], undefined, 'tare')
    store.editPage(page.id, { body: 'last' }, undefined, 'tare')
    const day = NOW - 200 * DAY
    ageVersions(store, page.id, [day, day + 1, day + 2, NOW])
    expect(thinHistory(store.database, OPTIONS).deleted).toBe(0)
  })

  it('reports without deleting on a dry run', async () => {
    const { store, page } = await pageWith(3)
    const day = NOW - 20 * DAY
    ageVersions(store, page.id, [NOW - 30 * DAY, day, day + 1000, NOW])
    expect(thinHistory(store.database, { ...OPTIONS, dryRun: true })).toEqual({
      candidates: 1,
      deleted: 0,
    })
    expect(store.history(page.id)).toHaveLength(4)
  })
})
