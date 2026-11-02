import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RelayStore } from './relay-store'

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
  it('gives pages a relative url by default, and an absolute one under publicUrl', async () => {
    const directory = await tempDirectory()
    const store = await RelayStore.open(directory)
    const project = await store.createProject('Alpha', '', 'tare')
    const page = await store.createPage(project.id, 'Plan', 'v0', 'tare')
    expect(page.url).toBe(`/doc/${page.id}`)
    expect(store.listPages(project.id)[0]?.url).toBe(page.url)
    store.close()

    const withPublicUrl = await RelayStore.open(directory, {
      publicUrl: 'https://relay.example.ts.net/',
    })
    try {
      const fresh = await withPublicUrl.readPage(page.id)
      expect(fresh.url).toBe(`https://relay.example.ts.net/doc/${page.id}`)
    } finally {
      withPublicUrl.close()
    }
  })

  it('runs a comment thread from anchored question to resolution and keeps it across a restart', async () => {
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
    await expect(async () =>
      store.threads.create(page.id, 'Missing', { anchorText: 'skip list' }, 'tare'),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(await store.threads.list({ to: 'claude' })).toHaveLength(1)
    expect(await store.threads.list({ to: 'someone-else' })).toHaveLength(0)

    const answered = await store.threads.reply(thread.id, 'Range scans need ordering', 'Claude')
    expect(answered.status).toBe('answered')
    expect(await store.threads.list()).toHaveLength(0)
    expect(await store.threads.list({ status: 'answered' })).toHaveLength(1)

    const messageId = answered.messages[1]?.id ?? ''
    await expect(async () =>
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

    expect(await store.history(page.id)).toHaveLength(1)
    store.close()

    store = await RelayStore.open(directory)
    const [restored] = await store.threads.listForPage(page.id)
    expect(restored).toMatchObject({ id: thread.id, status: 'resolved' })
    expect(restored?.messages.map((m) => m.author)).toEqual(['tare', 'Claude'])
    expect(await store.threads.list({ status: 'resolved' })).toHaveLength(1)
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

    await expect(async () =>
      store.threads.deleteMessage(thread.id, replyId, 'claude'),
    ).rejects.toMatchObject({
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
    await expect(async () =>
      store.replacePage(page.id, saved.body + 'x', page.revision, 'tare'),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(async () =>
      store.replacePage(page.id, '---\nid: x\ntitle: y\n---\n\nsneaky', saved.revision, 'tare'),
    ).rejects.toMatchObject({ code: 'invalid' })
    expect(await store.history(page.id)).toHaveLength(2)
    store.close()
  })

  it('records guarded edits and keeps their history after restart', async () => {
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
    await expect(async () =>
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
    expect(history[0]).toMatchObject({ actor: 'Claude', kind: 'edit' })
    expect(history[1]).toMatchObject({ actor: 'tare', kind: 'create' })
    store.close()
  })
})
