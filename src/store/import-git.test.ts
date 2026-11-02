import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { RelayStore } from './relay-store'

const exec = promisify(execFile)
const directories: string[] = []
const stores: RelayStore[] = []

afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  for (const directory of directories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

const page = (id: string, title: string, body: string, tags: string[] = []) =>
  `---\nid: ${id}\ntitle: ${title}\ntags: [${tags.join(', ')}]\n---\n\n${body}\n`

async function repository() {
  const data = await fs.mkdtemp(join(tmpdir(), 'relay-import-'))
  directories.push(data)
  const repo = join(data, 'projects')
  await fs.mkdir(join(repo, 'alpha'), { recursive: true })
  const git = (...args: string[]) => exec('git', ['-C', repo, ...args])
  await git('init', '-q')
  const write = (path: string, content: string) => fs.writeFile(join(repo, path), content)
  const commit = async (subject: string, email = 'tare@relay.local') => {
    await git('add', '-A')
    await git(
      '-c',
      'user.name=Relay',
      '-c',
      'user.email=relay@relay.local',
      'commit',
      '-q',
      `--author=Someone <${email}>`,
      '-m',
      subject,
    )
  }
  return { data, repo, git, write, commit }
}

async function seeded() {
  const r = await repository()
  await r.write('alpha/project.yaml', 'id: p1\nname: Alpha\ndescription: Notes\n')
  await r.commit('create: alpha/project.yaml (tare)')
  await r.write('alpha/plan.md', page('a1', 'Plan', 'first', ['design']))
  await r.commit('create: alpha/plan.md (tare)')
  await r.write('alpha/plan.md', page('a1', 'Plan', 'second', ['design']))
  await r.commit('edit: alpha/plan.md (claude)', 'claude@relay.local')
  return r
}

async function open(data: string) {
  const store = await RelayStore.open(data)
  stores.push(store)
  return store
}

describe('importing a git repository at startup', () => {
  it('turns commits into versions with their actor', async () => {
    const { data, repo } = await seeded()
    const store = await open(data)
    expect(store.listProjects()).toEqual([{ id: 'p1', name: 'Alpha', description: 'Notes' }])
    expect(store.readPage('a1')).toMatchObject({ title: 'Plan', tags: ['design'] })
    expect(store.readPage('a1').body).toBe('second\n')
    const history = store.history('a1')
    expect(history.map((h) => [h.kind, h.actor])).toEqual([
      ['edit', 'claude'],
      ['create', 'tare'],
    ])
    expect(store.readVersion('a1', history[1]!.id).body).toBe('first\n')
    expect(store.search.query({ query: 'second' })).toHaveLength(1)
    expect(existsSync(repo)).toBe(false)
    expect((await fs.readdir(data)).some((n) => n.startsWith('projects.imported-'))).toBe(true)
  })

  it('follows renames', async () => {
    const r = await seeded()
    await r.git('mv', 'alpha/plan.md', 'alpha/roadmap.md')
    await r.write('alpha/roadmap.md', page('a1', 'Roadmap', 'second', ['design']))
    await r.commit('rename: alpha/plan.md -> alpha/roadmap.md (tare)')
    const store = await open(r.data)
    expect(store.readPage('a1').title).toBe('Roadmap')
    expect(store.history('a1').map((h) => h.kind)).toEqual(['rename', 'edit', 'create'])
  })

  it('loads threads with their anchors and messages', async () => {
    const r = await seeded()
    const thread = {
      id: 't1',
      status: 'answered',
      to: ['claude'],
      messages: [
        { id: 'm1', author: 'tare', body: 'Why?', at: '2026-01-01T00:00:00.000Z' },
        { id: 'm2', author: 'claude', body: 'Because', at: '2026-01-01T00:01:00.000Z' },
      ],
      anchor: { exact: 'second', prefix: '', suffix: '\n', offset: 0 },
    }
    await r.write('alpha/plan.threads.json', JSON.stringify({ threads: [thread] }))
    await r.commit('comment: alpha/plan.threads.json (tare)')
    const store = await open(r.data)
    expect(store.threads.listForPage('a1')).toEqual([thread])
    expect(store.threads.list({ status: 'answered', to: 'claude' })).toHaveLength(1)
    expect(store.search.query({ query: 'because' })[0]).toMatchObject({ kind: 'thread', id: 't1' })
  })

  it('keeps deleted pages as soft deletes with their history', async () => {
    const r = await seeded()
    await r.write('alpha/gone.md', page('a2', 'Gone', 'bye'))
    await r.commit('create: alpha/gone.md (tare)')
    await r.git('rm', '-q', 'alpha/gone.md')
    await r.commit('delete: alpha/gone.md (tare)')
    const store = await open(r.data)
    expect(() => store.readPage('a2')).toThrow('Page not found')
    const rows = store.database
      .prepare('SELECT kind FROM page_versions WHERE page_id = ? ORDER BY id')
      .all('a2') as { kind: string }[]
    expect(rows.map((row) => row.kind)).toEqual(['create', 'delete'])
  })

  it('accepts an empty repository', async () => {
    const r = await repository()
    const store = await RelayStore.open(r.data)
    expect(store.listProjects()).toEqual([])
    store.close()
    expect((await open(r.data)).listProjects()).toEqual([])
  })
})
