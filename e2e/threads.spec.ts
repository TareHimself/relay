import { expect, test, type Page } from '@playwright/test'
import { mcpClient, mintScopedToken, openDoc, seed } from './helpers'

async function seedThread(page: Page) {
  const { project, pages } = await seed(page, [{ title: 'Review', body: 'A sentence to discuss.' }])
  const agent = mcpClient(page, await mintScopedToken(page, { name: 'asker', scope: 'write' }))
  await agent.call('comment', {
    pageId: pages[0]!.id,
    body: 'Needs a second look.',
    anchorText: 'sentence to discuss',
  })
  await openDoc(page, project.id, pages[0]!.id)
  await expect(page.getByText('Needs a second look.')).toBeVisible()
}

test('resolving a thread updates the UI immediately, before the server answers', async ({
  page,
}) => {
  await seedThread(page)
  await page.route('**/api/threads/*/resolve', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await route.continue()
  })
  const started = Date.now()
  await page.getByLabel('Resolve thread').click()
  await expect(page.getByText('Needs a second look.')).toBeHidden({ timeout: 1000 })
  expect(Date.now() - started).toBeLessThan(1500)
})

test('a failed resolve puts the thread back', async ({ page }) => {
  await seedThread(page)
  await page.route('**/api/threads/*/resolve', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }),
  )
  await page.getByLabel('Resolve thread').click()
  await expect(page.getByText('Needs a second look.')).toBeVisible()
  await expect(page.getByLabel('Resolve thread')).toBeVisible()
})

test('resolve and reopen persist on the server', async ({ page }) => {
  await seedThread(page)
  await page.getByLabel('Resolve thread').click()
  await expect(page.getByText('Needs a second look.')).toBeHidden()
  await page.getByText('Resolved (1)').click()
  await expect(page.getByText('Needs a second look.')).toBeVisible()
  await page.getByLabel('Reopen thread').click()
  await page.reload()
  await expect(page.getByText('Needs a second look.')).toBeVisible()
})
