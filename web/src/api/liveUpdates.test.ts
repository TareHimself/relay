import { describe, expect, it } from 'vitest'
import { keysAffectedBy } from './liveUpdates'
import { keys } from './queries'

const base = { id: 'e1', at: '2026-01-01T00:00:00Z', actor: 'claude', projectId: 'p1' }

describe('keysAffectedBy', () => {
  it('refreshes the projects list when a project appears', () => {
    expect(keysAffectedBy({ ...base, type: 'project.created' })).toEqual([keys.projects])
  })

  it('refreshes the doc list and the page for page events', () => {
    expect(keysAffectedBy({ ...base, type: 'page.updated', pageId: 'pg1' })).toEqual([
      keys.projectPages('p1'),
      keys.page('pg1'),
    ])
    expect(keysAffectedBy({ ...base, type: 'page.created' })).toEqual([keys.projectPages('p1')])
  })

  it('refreshes threads for comment events and ignores unknown types', () => {
    expect(keysAffectedBy({ ...base, type: 'comment.replied', pageId: 'pg1' })).toEqual([
      keys.threads('pg1'),
    ])
    expect(keysAffectedBy({ ...base, type: 'something.else' })).toEqual([])
  })
})
