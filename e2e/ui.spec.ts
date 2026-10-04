import { expect, test } from '@playwright/test'
import { ORIGIN, mintToken, seed } from './helpers'

test('long doc names truncate with an ellipsis', async ({ page }) => {
  const long = 'A very long document title that cannot possibly fit in the sidebar width'
  const { project } = await seed(page, [{ title: long, body: 'x' }])
  await page.goto(`/projects/${project.id}`)
  const link = page.locator('nav a, aside a', { hasText: long }).first()
  await expect(link).toBeVisible()
  const overflow = await link.evaluate((el, text) => {
    const label = [...el.querySelectorAll('span')].filter((s) => s.textContent === text).at(-1)
    return label ? getComputedStyle(label).textOverflow : 'missing'
  }, long)
  expect(overflow).toBe('ellipsis')
})

test('agent instructions are editable and project rules are human only', async ({ page }) => {
  const { project } = await seed(page, [])
  await page.goto('/settings')
  await page.getByLabel('Agent instructions').fill('Custom global rule for e2e.')
  await page
    .locator('.mantine-Paper-root', { has: page.getByLabel('Agent instructions') })
    .getByRole('button', { name: 'Save' })
    .click()
  await expect(page.getByRole('button', { name: 'Reset to default' })).toBeVisible()

  await page.goto(`/projects/${project.id}`)
  await page.getByRole('button', { name: 'Add agent rules' }).click()
  await page.getByLabel('Agent rules').last().fill('Project rule for e2e.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Agent rules' })).toBeVisible()

  const token = await mintToken(page, 'rules-agent')
  const denied = await page.request.put(`/api/projects/${project.id}/instructions`, {
    headers: { authorization: `Bearer ${token}`, origin: ORIGIN },
    data: { text: 'agent tries to write rules' },
  })
  expect(denied.status()).toBe(403)

  const init = await page.request.post('/mcp', {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '0' },
      },
    },
  })
  const { instructions } = ((await init.json()) as { result: { instructions: string } }).result
  expect(instructions).toContain('Custom global rule for e2e.')
  expect(instructions).toContain('Project rule for e2e.')
  expect(instructions).toContain('What pages can render')
})
