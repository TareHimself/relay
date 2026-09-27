import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupStores, tempStore } from '../test-support'
import { RelayStore } from './relay-store'
import { mergedMessage, planTidy, type CommitRecord } from './tidy'

const exec = promisify(execFile)

afterEach(cleanupStores)

const humans = new Set(['tare'])
const PATH = 'p/doc.md'

function commit(
  n: number,
  time: number,
  overrides: Partial<CommitRecord> & { subject?: string } = {},
): CommitRecord {
  const { subject = `edit: ${PATH} (tare)`, ...rest } = overrides
  return {
    hash: `h${n}`,
    parents: n > 0 ? [`h${n - 1}`] : [],
    tree: `t${n}`,
    authorName: 'Tare',
    authorEmail: 'tare@relay.local',
    authorDate: `${time} +0000`,
    committerName: 'Relay',
    committerEmail: 'relay@relay.local',
    committerDate: `${time} +0000`,
    message: `${subject}\n\nOperation-ID: op${n}\n`,
    files: [PATH],
    ...rest,
  }
}

describe('planTidy', () => {
  it('merges a run of quick autosaves and keeps other commits alone', () => {
    const commits = [
      commit(0, 1000, { subject: `create: ${PATH} (tare)` }),
      commit(1, 1010),
      commit(2, 1020),
      commit(3, 1030),
      commit(4, 2000),
    ]
    expect(planTidy(commits, humans)).toEqual([[0], [1, 2, 3], [4]])
  })

  it('splits a run after an idle gap or after the maximum span', () => {
    const idle = [commit(0, 1000), commit(1, 1100), commit(2, 1400)]
    expect(planTidy(idle, humans)).toEqual([[0, 1], [2]])
    const long = Array.from({ length: 30 }, (_, i) => commit(i, 1000 + i * 120))
    const groups = planTidy(long, humans)
    expect(groups.length).toBeGreaterThan(1)
    expect(groups.flat()).toHaveLength(30)
  })

  it('never merges across other files, other people, tokens or non-edit commits', () => {
    const commits = [
      commit(0, 1000),
      commit(1, 1010, {
        subject: 'comment: p/doc.threads.json (tare)',
        files: ['p/doc.threads.json'],
      }),
      commit(2, 1020),
      commit(3, 1030, { authorEmail: 'rita@relay.local' }),
      commit(4, 1040, { subject: `edit: ${PATH} (claude)` }),
      commit(5, 1050, { subject: `restore: ${PATH} (tare)` }),
      commit(6, 1060),
      commit(7, 1070, { files: [PATH, 'other.md'] }),
    ]
    expect(planTidy(commits, humans)).toEqual([[0], [1], [2], [3], [4], [5], [6], [7]])
  })

  it('keeps every operation id when messages are merged', () => {
    const group = [commit(1, 1000), commit(2, 1010), commit(3, 1020)]
    const message = mergedMessage(group)
    expect(message.split('\n')[0]).toBe(`edit: ${PATH} (tare)`)
    expect(message.match(/Operation-ID: op\d/g)).toEqual([
      'Operation-ID: op1',
      'Operation-ID: op2',
      'Operation-ID: op3',
    ])
  })
})

const dirOf = (store: RelayStore) => (store as unknown as { repoDir: string }).repoDir
const git = async (store: RelayStore, ...args: string[]) =>
  (await exec('git', ['-C', dirOf(store), ...args])).stdout.trim()

async function noisyStore() {
  const clock = { now: Date.now() }
  const seed = await tempStore()
  const store = await RelayStore.open(`${dirOf(seed)}-tidy`, { now: () => clock.now })
  await store.accounts.bootstrapAdmin({ handle: 'tare', password: 'test password!' })
  const project = await store.createProject('Alpha', '', 'tare')
  const page = await store.createPage(project.id, 'Plan', 'v0', 'tare')
  const save = async (body: string, actor = 'tare') => {
    clock.now += 10 * 60 * 1000
    const current = await store.readPage(page.id)
    await store.replacePage(page.id, body, current.revision, actor)
  }
  for (let i = 1; i <= 6; i += 1) await save(`human ${i}\n`)
  const current = await store.readPage(page.id)
  await store.editPage(
    page.id,
    { edits: [{ find: 'human 6', replace: 'agent' }] },
    current.revision,
    'claude',
  )
  for (let i = 7; i <= 9; i += 1) await save(`human ${i}\n`)
  await store.threads.create(page.id, 'a comment', {}, 'tare')
  for (let i = 10; i <= 12; i += 1) await save(`human ${i}\n`)
  return { store, page }
}

describe('tidyHistory', () => {
  it('shows the plan without changing anything', async () => {
    const { store } = await noisyStore()
    try {
      const before = await git(store, 'rev-parse', 'HEAD')
      const plan = await store.tidyHistory(false)
      expect(plan).toMatchObject({ before: 16, after: 7, merged: 9, applied: false })
      expect(await git(store, 'rev-parse', 'HEAD')).toBe(before)
    } finally {
      store.close()
    }
  })

  it('merges autosave runs, keeps content and operation ids, and can be undone', async () => {
    const { store, page } = await noisyStore()
    try {
      const treeBefore = await git(store, 'rev-parse', 'HEAD^{tree}')
      const headBefore = await git(store, 'rev-parse', 'HEAD')
      const idsBefore = (await git(store, 'log', '--format=%B')).match(/Operation-ID: \w+/g)!
      const firstHash = await git(store, 'rev-list', '--max-parents=0', 'HEAD')

      const result = await store.tidyHistory(true)
      expect(result).toMatchObject({ before: 16, after: 7, merged: 9, applied: true })

      expect(await git(store, 'rev-parse', 'HEAD^{tree}')).toBe(treeBefore)
      expect(await git(store, 'status', '--porcelain', '--untracked-files=no')).toBe('')
      expect(await git(store, 'rev-list', '--count', 'HEAD')).toBe('7')
      expect(await git(store, 'rev-list', '--max-parents=0', 'HEAD')).toBe(firstHash)
      const idsAfter = (await git(store, 'log', '--format=%B')).match(/Operation-ID: \w+/g)!
      expect(idsAfter.sort()).toEqual(idsBefore.sort())
      expect(await git(store, 'rev-parse', result.backupRef!)).toBe(headBefore)
      expect(await git(store, 'rev-list', '--count', result.backupRef!)).toBe('16')

      const history = await store.history(page.id)
      expect(history.map((entry) => entry.subject.split(':')[0])).toEqual([
        'edit',
        'edit',
        'edit',
        'edit',
        'create',
      ])
      expect((await store.readPage(page.id)).body).toContain('human 12')
      expect(await store.tidyHistory(false)).toMatchObject({ merged: 0 })
    } finally {
      store.close()
    }
  })

  it('survives a restart and keeps working afterwards', async () => {
    const { store, page } = await noisyStore()
    const dir = dirOf(store)
    await store.tidyHistory(true)
    store.close()
    const reopened = await RelayStore.open(dir)
    try {
      const current = await reopened.readPage(page.id)
      await reopened.editPage(
        page.id,
        { edits: [{ find: 'human 12', replace: 'after tidy' }] },
        current.revision,
        'claude',
      )
      expect((await reopened.readPage(page.id)).body).toContain('after tidy')
      expect((await reopened.history(page.id)).length).toBe(6)
    } finally {
      reopened.close()
    }
  })
})
