import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { RelayStore } from './relay-store'

const exec = promisify(execFile)
const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true })
})

async function tempDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(join(tmpdir(), 'relay-test-'))
  directories.push(directory)
  return directory
}

describe('RelayStore', () => {
  it('runs a comment thread from anchored question to resolution and rebuilds it from files', async () => {
    const directory = await tempDirectory()
    let store = await RelayStore.open(directory)
    const project = await store.createProject('Project Alpha', '', 'tare')
    const page = await store.createPage(
      project.id,
      'Design Notes',
      'Use a B-tree for lookups',
      'tare',
    )

    const thread = await store.threads.create(
      page.id,
      'Why not a hash map, @Claude?',
      { anchorText: 'B-tree' },
      'tare',
    )
    expect(thread.anchor).toMatchObject({ exact: 'B-tree', suffix: ' for lookups\n' })
    await expect(
      store.threads.create(page.id, 'Missing', { anchorText: 'skip list' }, 'tare'),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(await store.threads.list({ to: 'claude' })).toHaveLength(1)
    expect(await store.threads.list({ to: 'someone-else' })).toHaveLength(0)

    const answered = await store.threads.reply(thread.id, 'Range scans need ordering', 'Claude')
    expect(answered.status).toBe('answered')
    expect(await store.threads.list()).toHaveLength(0)
    expect(await store.threads.list({ status: 'answered' })).toHaveLength(1)

    const messageId = answered.messages[1]?.id ?? ''
    await expect(
      store.threads.editMessage(thread.id, messageId, 'Hijack', 'tare'),
    ).rejects.toMatchObject({
      code: 'forbidden',
    })
    const edited = await store.threads.editMessage(
      thread.id,
      messageId,
      'Range scans need order',
      'Claude',
    )
    expect(edited.messages[1]).toMatchObject({ body: 'Range scans need order' })
    expect(edited.messages[1]?.editedAt).toBeDefined()
    expect(edited.status).toBe('answered')

    await store.threads.resolve(thread.id, 'tare')
    expect((await store.threads.resolve(thread.id, 'tare')).status).toBe('resolved')
    expect(await store.threads.list({ status: 'resolved' })).toHaveLength(1)

    expect(store.listEvents().map((event) => [event.type, event.threadId ? 't' : '-'])).toEqual([
      ['project.created', '-'],
      ['page.created', '-'],
      ['comment.created', 't'],
      ['comment.addressed', 't'],
      ['comment.replied', 't'],
      ['comment.edited', 't'],
      ['comment.resolved', 't'],
    ])
    expect(store.listEvents().find((e) => e.type === 'comment.addressed')?.summary).toMatch(
      /^@claude: /,
    )

    const history = await store.history(page.id)
    expect(history).toHaveLength(1)
    const { stdout } = await exec('git', [
      '-C',
      join(directory, 'projects'),
      'log',
      '--format=%s',
      '-5',
    ])
    expect(stdout.trim().split('\n')).toEqual([
      'comment: project-alpha/design-notes.threads.json (tare)',
      'comment: project-alpha/design-notes.threads.json (Claude)',
      'comment: project-alpha/design-notes.threads.json (Claude)',
      'comment: project-alpha/design-notes.threads.json (tare)',
      'create: project-alpha/design-notes.md (tare)',
    ])
    store.close()

    store = await RelayStore.open(directory)
    const [restored] = await store.threads.listForPage(page.id)
    expect(restored).toMatchObject({ id: thread.id, status: 'resolved' })
    expect(restored?.messages.map((m) => m.author)).toEqual(['tare', 'Claude'])
    expect(await store.threads.list({ status: 'resolved' })).toHaveLength(1)
    store.close()
  })

  it('skips unreadable files at startup and reports them instead of failing', async () => {
    const directory = await tempDirectory()
    const write = async (path: string, content: string) => {
      await fs.mkdir(join(directory, path, '..'), { recursive: true })
      await fs.writeFile(join(directory, path), content)
    }
    const page = (id: string, title: string) => `---\nid: ${id}\ntitle: ${title}\n---\n\nBody\n`
    await write('good/project.yaml', 'id: p1\nname: Good\n')
    await write('good/ok.md', page('a1', 'Ok'))
    await write('good/ok.threads.json', '{ not json')
    await write('good/no-frontmatter.md', 'just text')
    await write('good/z-copy.md', page('a1', 'Copy'))
    await write('broken/project.yaml', 'name: [unclosed')

    const store = await RelayStore.open(directory)
    expect(store.listProjects().map((p) => p.name)).toEqual(['Good'])
    expect(store.listPages('p1').map((p) => p.title)).toEqual(['Ok'])
    expect(
      store
        .listProblems()
        .map((p) => p.path)
        .sort(),
    ).toEqual([
      'broken/project.yaml',
      'good/no-frontmatter.md',
      'good/ok.threads.json',
      'good/z-copy.md',
    ])
    await expect(store.threads.create('a1', 'hi', {}, 'tare')).rejects.toMatchObject({
      code: 'invalid',
    })
    store.close()
  })

  it('deletes replies and threads, and reopens resolved threads', async () => {
    const directory = await tempDirectory()
    const store = await RelayStore.open(directory)
    const project = await store.createProject('Project Alpha', '', 'tare')
    const page = await store.createPage(project.id, 'Notes', 'Some text here', 'tare')
    const thread = await store.threads.create(page.id, 'First', { anchorText: 'text' }, 'tare')
    const reply = await store.threads.reply(thread.id, 'Second', 'tare')
    const replyId = reply.messages[1]?.id ?? ''

    await expect(store.threads.deleteMessage(thread.id, replyId, 'claude')).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(await store.threads.deleteMessage(thread.id, replyId, 'tare')).toEqual({
      threadRemoved: false,
    })
    expect((await store.threads.listForPage(page.id))[0]?.messages).toHaveLength(1)

    await store.threads.resolve(thread.id, 'tare')
    expect((await store.threads.reopen(thread.id, 'tare')).status).toBe('open')
    expect((await store.threads.reopen(thread.id, 'tare')).status).toBe('open')

    const firstId = thread.messages[0]?.id ?? ''
    expect(await store.threads.deleteMessage(thread.id, firstId, 'tare')).toEqual({
      threadRemoved: true,
    })
    expect(await store.threads.listForPage(page.id)).toEqual([])
    expect(await store.threads.list()).toEqual([])
    expect(store.listEvents().map((event) => event.type)).toEqual([
      'project.created',
      'page.created',
      'comment.created',
      'comment.replied',
      'comment.deleted',
      'comment.resolved',
      'comment.reopened',
      'comment.deleted',
    ])
    store.close()
  })

  it('replaces a whole page under a revision guard and ignores no-op saves', async () => {
    const directory = await tempDirectory()
    const store = await RelayStore.open(directory)
    const project = await store.createProject('Project Alpha', '', 'tare')
    const page = await store.createPage(project.id, 'Notes', 'One', 'tare')

    expect(await store.replacePage(page.id, page.body, page.revision, 'tare')).toMatchObject({
      revision: page.revision,
    })
    const saved = await store.replacePage(
      page.id,
      page.body.replace('One', 'Two'),
      page.revision,
      'tare',
    )
    expect(saved.body).toContain('Two')
    await expect(
      store.replacePage(page.id, saved.body + 'x', page.revision, 'tare'),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      store.replacePage(page.id, '---\nid: x\ntitle: y\n---\n\nsneaky', saved.revision, 'tare'),
    ).rejects.toMatchObject({ code: 'invalid' })
    expect(await store.history(page.id)).toHaveLength(2)
    store.close()
  })

  it('commits guarded edits and preserves their event and commit link after restart', async () => {
    const directory = await tempDirectory()
    let store = await RelayStore.open(directory)
    const project = await store.createProject('Project Alpha', '', 'tare')
    const page = await store.createPage(project.id, 'Design Notes', 'Original text', 'tare')
    const edited = await store.editPage(
      page.id,
      { edits: [{ find: 'Original text', replace: 'Updated text' }] },
      page.revision,
      'Claude',
    )
    expect(edited.body).toContain('Updated text')
    expect(edited.revision).not.toBe(page.revision)
    expect(store.listEvents().map((event) => event.type)).toEqual([
      'project.created',
      'page.created',
      'page.updated',
    ])
    await expect(
      store.editPage(
        page.id,
        { edits: [{ find: 'Updated text', replace: 'Lost change' }] },
        page.revision,
        'tare',
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
    store.close()

    store = await RelayStore.open(directory)
    expect((await store.readPage(page.id)).body).toContain('Updated text')
    const history = await store.history(page.id)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      author: 'Claude',
      subject: 'edit: project-alpha/design-notes.md (Claude)',
    })
    expect(history[1]?.subject).toBe('create: project-alpha/design-notes.md (tare)')
    const { stdout: email } = await exec('git', [
      '-C',
      join(directory, 'projects'),
      'log',
      '-1',
      '--format=%ae',
    ])
    expect(email.trim()).toBe('claude@relay.local')
    const db = new Database(join(directory, 'db', 'state.db'), { readonly: true })
    const completed = db
      .prepare("SELECT commit_hash FROM operations WHERE status = 'complete' ORDER BY id")
      .all() as { commit_hash: string }[]
    expect(completed).toHaveLength(3)
    const { stdout } = await exec('git', ['-C', join(directory, 'projects'), 'rev-parse', 'HEAD'])
    expect(completed[2]?.commit_hash).toBe(stdout.trim())
    db.close()
    store.close()
  })
})
