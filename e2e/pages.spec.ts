import { expect, test } from '@playwright/test'
import { docUrl, login, mintToken, openDoc, ORIGIN, seed } from './helpers'

test('a created page shows its body, not a blank editor', async ({ page }) => {
  const { project, pages } = await seed(page, [
    { title: 'Has body', body: '## Heading\n\nParagraph text here.' },
  ])
  await openDoc(page, project.id, pages[0]!.id)
  await expect(page.locator('.cm-content')).toContainText('Paragraph text here.')
})

test('MCP create_page puts the body on the page and rejects a missing one', async ({
  page,
  request,
}) => {
  const { project } = await seed(page, [])
  const token = await mintToken(page, 'e2e-agent')
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await request.post('/mcp', {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    })
    return (await response.json()).result
  }

  const missing = await call('create_page', { projectId: project.id, title: 'No body' })
  expect(missing.isError).toBe(true)

  const created = await call('create_page', {
    projectId: project.id,
    title: 'Agent page',
    body: 'written by an agent',
  })
  expect(created.isError).toBeFalsy()
  await login(page)
  await page.goto(docUrl(project.id, JSON.parse(created.content[0].text).id))
  await expect(page.locator('.cm-content')).toContainText('written by an agent')
})

test('home grid sorts by title by default and can switch to recently edited', async ({ page }) => {
  const { project, pages } = await seed(page, [
    { title: '10 Ten', body: 'x' },
    { title: '02 Two', body: 'x' },
    { title: '01 One', body: 'x' },
  ])
  await page.waitForTimeout(1100)
  const edited = await page.request.patch(`/api/pages/${pages[1]!.id}`, {
    headers: { origin: ORIGIN },
    data: { edits: [{ find: 'x', replace: 'edited last' }] },
  })
  expect(edited.ok()).toBe(true)
  await page.goto(`/projects/${project.id}`)
  const cards = page.getByTestId('doc-grid').locator('a')
  await expect(cards.first()).toContainText('01 One')
  await expect(cards).toHaveCount(3)
  expect(await cards.allInnerTexts().then((texts) => texts.map((t) => t.slice(0, 6)))).toEqual([
    '01 One',
    '02 Two',
    '10 Ten',
  ])
  await page.getByText('Recently edited').click()
  await expect(cards.first()).toContainText('02 Two')
})
