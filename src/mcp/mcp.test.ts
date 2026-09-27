import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../http/app'
import { adminClient, cleanupStores, json, tempStore } from '../test-support'

afterEach(cleanupStores)

const EXPECTED_TOOLS = [
  'comment',
  'create_page',
  'create_project',
  'delete_page',
  'diff',
  'edit_page',
  'history',
  'list_pages',
  'list_projects',
  'list_tags',
  'open_threads',
  'poll_events',
  'read_page',
  'read_threads',
  'read_version',
  'reply',
  'resolve',
  'restore_version',
  'search',
  'set_tags',
  'whoami',
]

function mcp(store: Awaited<ReturnType<typeof tempStore>>, token?: string) {
  const app = createApp(store)
  let id = 0
  const post = (body: unknown) =>
    app.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  const rpc = async (method: string, params: unknown = {}) =>
    json(await post({ jsonrpc: '2.0', id: ++id, method, params }))
  const call = async (name: string, args: unknown = {}) => {
    const reply = await rpc('tools/call', { name, arguments: args })
    const result = reply.result
    return { isError: result.isError === true, data: JSON.parse(result.content[0].text) }
  }
  return { post, rpc, call }
}

async function setup() {
  const store = await tempStore()
  const admin = await adminClient(store)
  const project = await json(await admin.send('POST', '/api/projects', { name: 'Alpha' }))
  const page = await json(
    await admin.send('POST', `/api/projects/${project.id}/pages`, {
      title: 'Plan',
      body: '## Goals\n\nold goals\n\n## Risks\n\nold risks\n',
    }),
  )
  const mint = async (input: Record<string, unknown>) =>
    (await json(await admin.send('POST', '/api/tokens', input))).token as string
  return { store, project, page, mint }
}

describe('MCP endpoint', () => {
  it('requires a valid token', async () => {
    const { store } = await setup()
    expect((await mcp(store).post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(
      401,
    )
    expect(
      (await mcp(store, 'rly_bad').post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).status,
    ).toBe(401)
  })

  it('initializes and lists every design tool', async () => {
    const { store, mint } = await setup()
    const agent = mcp(store, await mint({ name: 'claude' }))
    const init = await agent.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    })
    expect(init.result.serverInfo.name).toBe('relay')
    const tools = await agent.rpc('tools/list')
    expect(tools.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(EXPECTED_TOOLS)
    const edit = tools.result.tools.find((t: { name: string }) => t.name === 'edit_page')
    expect(edit.description).toContain('ifRevision')
  })

  it('reads, edits by quote and section, and reports conflicts with the current text', async () => {
    const { store, page, mint } = await setup()
    const agent = mcp(store, await mint({ name: 'claude' }))
    expect((await agent.call('whoami')).data).toMatchObject({ handle: 'claude', scope: 'write' })

    const read = await agent.call('read_page', { id: page.id })
    expect(read.data.body).toContain('old goals')
    expect(
      (await agent.call('read_page', { id: page.id, sinceRevision: read.data.revision })).data,
    ).toEqual({ id: page.id, revision: read.data.revision, unchanged: true })

    const byQuote = await agent.call('edit_page', {
      id: page.id,
      ifRevision: read.data.revision,
      edits: [{ find: 'old goals', replace: 'new goals' }],
      includeBody: true,
    })
    expect(byQuote.data.body).toContain('new goals')

    const stale = await agent.call('edit_page', {
      id: page.id,
      ifRevision: read.data.revision,
      edits: [{ find: 'new goals', replace: 'lost' }],
    })
    expect(stale.isError).toBe(true)
    expect(stale.data.error).toBe('conflict')
    expect(stale.data.details.current.body).toContain('new goals')

    const bySection = await agent.call('edit_page', {
      id: page.id,
      edits: [{ section: 'Risks', replace: 'none known' }],
      includeBody: true,
    })
    expect(bySection.data.body).toContain('## Risks\n\nnone known\n')

    const missing = await agent.call('edit_page', {
      id: page.id,
      edits: [{ find: 'nowhere', replace: 'x' }],
    })
    expect(missing.isError).toBe(true)
    expect(missing.data.details.current).toContain('none known')
  })

  it('runs the review loop: comment, poll, reply, resolve', async () => {
    const { store, page, mint } = await setup()
    const human = await adminClient(store)
    const agent = mcp(store, await mint({ name: 'claude' }))
    const cursor = (await agent.call('poll_events')).data.next

    await human.send('POST', `/api/pages/${page.id}/threads`, {
      body: 'Please check this, @claude',
      anchorText: 'old risks',
    })
    const polled = await agent.call('poll_events', { since: cursor, excludeActor: 'claude' })
    expect(polled.data.events.map((e: { type: string }) => e.type)).toEqual([
      'comment.created',
      'comment.addressed',
    ])

    const open = await agent.call('open_threads', { to: 'claude' })
    expect(open.data).toHaveLength(1)
    const threadId = open.data[0].id

    const replied = await agent.call('reply', { threadId, body: 'Checked, looks fine' })
    expect(replied.data.status).toBe('answered')
    expect(replied.data.messages[1].author).toBe('claude')
    expect((await agent.call('open_threads', { to: 'claude' })).data).toHaveLength(0)

    expect((await agent.call('resolve', { threadId })).data.status).toBe('resolved')
    const own = await agent.call('poll_events', { since: cursor, excludeActor: 'claude' })
    expect(own.data.events.every((e: { actor: string }) => e.actor !== 'claude')).toBe(true)

    const created = await agent.call('comment', {
      pageId: page.id,
      body: 'A question',
      anchorText: 'old goals',
    })
    expect(created.data.anchor.exact).toBe('old goals')
    expect((await agent.call('read_threads', { pageId: page.id })).data).toHaveLength(2)
  })

  it('lists projects and pages, creates pages, and shows history and diffs', async () => {
    const { store, project, page, mint } = await setup()
    const agent = mcp(store, await mint({ name: 'claude' }))
    expect((await agent.call('list_projects')).data).toHaveLength(1)
    expect((await agent.call('list_pages', { projectId: project.id })).data[0].title).toBe('Plan')
    const created = await agent.call('create_page', {
      projectId: project.id,
      title: 'Agent notes',
      markdown: 'written by an agent',
      includeBody: true,
    })
    expect(created.data.body).toContain('written by an agent')

    await agent.call('edit_page', {
      id: page.id,
      edits: [{ find: 'old goals', replace: 'bold goals' }],
    })
    const history = (await agent.call('history', { id: page.id })).data
    expect(history[0].author).toBe('claude')
    const diff = await agent.call('diff', {
      id: page.id,
      from: history[1].hash,
      to: history[0].hash,
    })
    expect(diff.data.diff).toContain('+bold goals')
  })

  it('returns metadata only unless the body is asked for', async () => {
    const { store, project, page, mint } = await setup()
    const agent = mcp(store, await mint({ name: 'claude' }))
    const created = await agent.call('create_page', {
      projectId: project.id,
      title: 'Lean',
      markdown: 'short',
    })
    expect(Object.keys(created.data).sort()).toEqual([
      'id',
      'path',
      'projectId',
      'revision',
      'status',
      'tags',
      'title',
      'updatedAt',
    ])
    const edited = await agent.call('edit_page', {
      id: page.id,
      edits: [{ find: 'old goals', replace: 'lean goals' }],
    })
    expect(edited.data).not.toHaveProperty('body')
    expect(edited.data).toMatchObject({ id: page.id, status: 'draft', tags: [] })
    const tagged = await agent.call('set_tags', { id: page.id, tags: ['x'] })
    expect(tagged.data).not.toHaveProperty('body')
  })

  it('reads plain markdown with an outline and no frontmatter', async () => {
    const { store, page, mint } = await setup()
    const agent = mcp(store, await mint({ name: 'claude' }))
    await agent.call('edit_page', {
      id: page.id,
      body: '# Title\n\n## Goals\n\nx\n\n## Goals\n\ny\n\n```\n# not a heading\n```\n',
    })
    const read = (await agent.call('read_page', { id: page.id })).data
    expect(read.body).not.toContain('---')
    expect(read.status).toBe('draft')
    expect(read.outline).toEqual([
      { text: 'Title', level: 1, id: 'title' },
      { text: 'Goals', level: 2, id: 'goals' },
      { text: 'Goals', level: 2, id: 'goals-1' },
    ])
    const lean = (await agent.call('read_page', { id: page.id, includeBody: false })).data
    expect(lean).not.toHaveProperty('body')
    expect(lean.outline).toHaveLength(3)
  })

  it('replaces the whole body while keeping history and threads', async () => {
    const { store, page, mint } = await setup()
    const agent = mcp(store, await mint({ name: 'claude' }))
    const thread = (
      await agent.call('comment', { pageId: page.id, body: 'keep me', anchorText: 'old goals' })
    ).data
    const replaced = await agent.call('edit_page', {
      id: page.id,
      body: '## Goals\n\nold goals, reformatted',
      includeBody: true,
    })
    expect(replaced.data.id).toBe(page.id)
    expect(replaced.data.body).toBe('## Goals\n\nold goals, reformatted\n')
    expect((await agent.call('history', { id: page.id })).data.length).toBeGreaterThan(1)
    expect((await agent.call('read_threads', { pageId: page.id })).data[0].id).toBe(thread.id)
  })

  it('sets status by parameter, filters list_pages by it, and guards the write path', async () => {
    const { store, project, page, mint } = await setup()
    const agent = mcp(store, await mint({ name: 'claude' }))
    const published = await agent.call('edit_page', { id: page.id, status: 'published' })
    expect(published.data.status).toBe('published')
    const draft = await agent.call('create_page', { projectId: project.id, title: 'Rough' })
    expect(draft.data.status).toBe('draft')
    const shown = (await agent.call('list_pages', { projectId: project.id })).data
    expect(shown.map((p: { status: string }) => p.status).sort()).toEqual(['draft', 'published'])
    const only = (await agent.call('list_pages', { projectId: project.id, status: 'published' }))
      .data
    expect(only.map((p: { id: string }) => p.id)).toEqual([page.id])
    const bogus = await agent.rpc('tools/call', {
      name: 'edit_page',
      arguments: { id: page.id, status: 'bogus' },
    })
    expect(bogus.result.isError).toBe(true)

    const sneaky = '---\nid: abc\ntitle: Nope\nstatus: published\n---\n\nhello'
    const viaCreate = await agent.call('create_page', {
      projectId: project.id,
      title: 'Sneaky',
      markdown: sneaky,
    })
    expect(viaCreate.isError).toBe(true)
    expect(viaCreate.data.message).toContain('frontmatter')
    const viaEdit = await agent.call('edit_page', { id: page.id, body: sneaky })
    expect(viaEdit.isError).toBe(true)
    const both = await agent.call('edit_page', {
      id: page.id,
      body: 'x',
      edits: [{ find: 'old', replace: 'new' }],
    })
    expect(both.isError).toBe(true)
    expect((await agent.call('edit_page', { id: page.id })).isError).toBe(true)
  })

  it('answers an unsupported protocol version with a 404 instead of a 500', async () => {
    const { store, mint } = await setup()
    const token = await mint({ name: 'claude' })
    const response = await createApp(store).request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
        'mcp-protocol-version': '2099-01-01',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(response.status).toBe(404)
    expect((await response.json()).error.message).toContain('Unsupported protocol version')
  })

  it('creates projects', async () => {
    const { store, mint } = await setup()
    const agent = mcp(store, await mint({ name: 'claude' }))
    const made = await agent.call('create_project', { name: 'Beta', description: 'second' })
    expect(made.data).toMatchObject({ name: 'Beta', description: 'second' })
    expect((await agent.call('list_projects')).data).toHaveLength(2)
    const reader = mcp(store, await mint({ name: 'ro', scope: 'read' }))
    expect((await reader.call('create_project', { name: 'Gamma' })).isError).toBe(true)
  })

  it('enforces read-only scope and project restriction inside tools', async () => {
    const { store, project, page, mint } = await setup()
    const other = await store.createProject('Other', '', 'tare')
    const reader = mcp(store, await mint({ name: 'reader', scope: 'read' }))
    expect((await reader.call('read_page', { id: page.id })).isError).toBe(false)
    const denied = await reader.call('edit_page', {
      id: page.id,
      edits: [{ find: 'old goals', replace: 'x' }],
    })
    expect(denied.isError).toBe(true)
    expect(denied.data.error).toBe('forbidden')

    const scoped = mcp(store, await mint({ name: 'scoped', projectId: project.id }))
    expect((await scoped.call('list_projects')).data).toHaveLength(1)
    expect((await scoped.call('list_pages', { projectId: other.id })).data.error).toBe('forbidden')
  })
})
