import { expect, test } from '@playwright/test'
import { createProject, mcpClient, mintScopedToken, openDoc, seed } from './helpers'

test('initialize sends instructions and lists the tools with create_page body required', async ({
  page,
}) => {
  await seed(page, [])
  const agent = mcpClient(page, await mintScopedToken(page, { name: 'init', scope: 'write' }))
  const init = await agent.rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'e2e', version: '0' },
  })
  expect(init.result.instructions).toContain('What pages can render')
  expect(init.result.instructions).toContain('Mermaid')

  const { result } = await agent.rpc('tools/list')
  const names = result.tools.map((tool: { name: string }) => tool.name)
  for (const name of ['markdown_support', 'create_page', 'edit_page', 'comment', 'search']) {
    expect(names).toContain(name)
  }
  const create = result.tools.find((tool: { name: string }) => tool.name === 'create_page')
  expect(create.inputSchema.required).toContain('body')
})

test('markdown_support lists what renders and what does not', async ({ page }) => {
  await seed(page, [])
  const agent = mcpClient(page, await mintScopedToken(page, { name: 'support', scope: 'read' }))
  const { data } = await agent.call('markdown_support')
  const features = data.supported.map((item: { feature: string }) => item.feature)
  expect(features).toEqual(expect.arrayContaining(['Tables', 'Mermaid diagrams', 'SVG graphics']))
  expect(JSON.stringify(data.notSupported)).toContain('<svg>')
})

test('read tokens cannot write', async ({ page }) => {
  const { project, pages } = await seed(page, [{ title: 'Mine', body: 'content' }])
  const reader = mcpClient(page, await mintScopedToken(page, { name: 'reader', scope: 'read' }))
  expect((await reader.call('read_page', { id: pages[0]!.id })).data.body).toContain('content')

  const edit = await reader.call('edit_page', {
    id: pages[0]!.id,
    edits: [{ find: 'content', replace: 'changed' }],
  })
  expect(edit.isError).toBe(true)
  expect(edit.data.error).toBe('forbidden')
  const create = await reader.call('create_page', { projectId: project.id, title: 'x', body: '' })
  expect(create.isError).toBe(true)
})

test('project tokens cannot see or touch other projects', async ({ page }) => {
  const { project, pages } = await seed(page, [{ title: 'Mine', body: 'content' }])
  const other = await createProject(page, `Other ${Date.now()}`)
  const agent = mcpClient(
    page,
    await mintScopedToken(page, { name: 'scoped', scope: 'write', projectId: project.id }),
  )
  const visible = (await agent.call('list_projects')).data as { id: string }[]
  expect(visible.map((p) => p.id)).toEqual([project.id])
  expect((await agent.call('read_page', { id: pages[0]!.id })).isError).toBe(false)
  const crossed = await agent.call('create_page', { projectId: other.id, title: 'no', body: '' })
  expect(crossed.isError).toBe(true)
  expect(crossed.data.error).toBe('forbidden')
})

test('edits: find, section and body replace, stale revisions conflict, frontmatter is rejected', async ({
  page,
}) => {
  const { project } = await seed(page, [])
  const agent = mcpClient(page, await mintScopedToken(page, { name: 'editor', scope: 'write' }))
  const created = await agent.call('create_page', {
    projectId: project.id,
    title: 'Plan',
    body: '## Goals\n\nold goals\n\n## Risks\n\nold risks\n',
  })
  expect(created.isError).toBe(false)
  const id = created.data.id as string

  const first = await agent.call('edit_page', {
    id,
    edits: [{ find: 'old goals', replace: 'new goals' }],
    ifRevision: created.data.revision,
    includeBody: true,
  })
  expect(first.data.body).toContain('new goals')

  const stale = await agent.call('edit_page', {
    id,
    edits: [{ find: 'old risks', replace: 'x' }],
    ifRevision: created.data.revision,
  })
  expect(stale.isError).toBe(true)
  expect(stale.data.details.current.body).toContain('new goals')

  const section = await agent.call('edit_page', {
    id,
    edits: [{ section: 'Risks', replace: '\nrewritten risks\n' }],
    includeBody: true,
  })
  expect(section.data.body).toContain('rewritten risks')
  expect(section.data.body).toContain('new goals')

  const missing = await agent.call('edit_page', {
    id,
    edits: [{ find: 'does not exist', replace: 'x' }],
  })
  expect(missing.isError).toBe(true)

  const frontmatter = await agent.call('edit_page', { id, body: '---\nid: x\n---\n\nbody' })
  expect(frontmatter.isError).toBe(true)

  const replaced = await agent.call('edit_page', { id, body: 'whole new body', includeBody: true })
  expect(replaced.data.id).toBe(id)
  expect(replaced.data.body).toContain('whole new body')
})

test('an agent edit shows up for the human in the editor', async ({ page }) => {
  const { project, pages } = await seed(page, [{ title: 'Shared', body: 'before agent' }])
  await openDoc(page, project.id, pages[0]!.id)
  const agent = mcpClient(page, await mintScopedToken(page, { name: 'live', scope: 'write' }))
  await agent.call('edit_page', {
    id: pages[0]!.id,
    edits: [{ find: 'before agent', replace: 'after agent' }],
  })
  await page.reload()
  await expect(page.locator('.cm-content')).toContainText('after agent')
})

test('comments: agent comments on text, replies and resolves, human sees the thread', async ({
  page,
}) => {
  const { project, pages } = await seed(page, [
    { title: 'Review', body: 'The anchored sentence lives here.' },
  ])
  const agent = mcpClient(page, await mintScopedToken(page, { name: 'reviewer', scope: 'write' }))
  const thread = await agent.call('comment', {
    pageId: pages[0]!.id,
    body: 'Please tighten this wording.',
    anchorText: 'anchored sentence',
  })
  expect(thread.isError).toBe(false)

  await openDoc(page, project.id, pages[0]!.id)
  await expect(page.getByText('Please tighten this wording.')).toBeVisible()

  const reply = await agent.call('reply', { threadId: thread.data.id, body: 'Follow-up note.' })
  expect(reply.isError).toBe(false)
  const read = await agent.call('read_threads', { pageId: pages[0]!.id })
  expect(read.data[0].messages).toHaveLength(2)

  const resolved = await agent.call('resolve', { threadId: thread.data.id })
  expect(resolved.data.status).toBe('resolved')
  const open = await agent.call('open_threads', {})
  expect(JSON.stringify(open.data)).not.toContain('Please tighten this wording.')
})

test('history, diff, restore, search, events and delete', async ({ page }) => {
  const { project } = await seed(page, [])
  const agent = mcpClient(page, await mintScopedToken(page, { name: 'archivist', scope: 'write' }))
  const created = await agent.call('create_page', {
    projectId: project.id,
    title: 'Ledger',
    body: 'zebrafinch version one',
  })
  const id = created.data.id as string
  const edited = await agent.call('edit_page', {
    id,
    edits: [{ find: 'version one', replace: 'version two' }],
  })

  const history = (await agent.call('history', { id })).data as { id: string }[]
  expect(history.length).toBeGreaterThanOrEqual(2)
  const oldest = history.at(-1)!.id
  const diff = await agent.call('diff', { id, from: oldest })
  expect(diff.data.diff).toContain('version two')
  expect((await agent.call('read_version', { id, versionId: oldest })).data.body).toContain(
    'version one',
  )

  const hits = (await agent.call('search', { query: 'zebrafinch', projectId: project.id }))
    .data as { snippet: string }[]
  expect(hits.length).toBeGreaterThan(0)

  const events = await agent.call('poll_events', { projectId: project.id })
  expect(events.data.events.map((event: { type: string }) => event.type)).toEqual(
    expect.arrayContaining(['page.created']),
  )

  const restored = await agent.call('restore_version', {
    id,
    versionId: oldest,
    ifRevision: edited.data.revision,
    includeBody: true,
  })
  expect(restored.isError).toBe(false)
  expect((await agent.call('read_page', { id })).data.body).toContain('version one')

  const deleted = await agent.call('delete_page', { id })
  expect(deleted.isError).toBe(false)
  expect((await agent.call('read_page', { id })).isError).toBe(true)
})
