import { expect, test } from '@playwright/test'
import { openDoc, seed } from './helpers'

test('raw html in a page stays source and paints nothing over the app', async ({ page }) => {
  const overlay =
    '<div id="planted" style="position:fixed;inset:0;z-index:99999;background:#fff">Session expired</div>'
  const { project, pages } = await seed(page, [
    { title: 'Html', body: `${overlay}\n\nInline <b id="planted-inline">bold</b> text.` },
  ])
  await openDoc(page, project.id, pages[0]!.id)
  await expect(page.getByText('position:fixed')).toBeVisible()
  await expect(page.locator('#planted')).toHaveCount(0)
  await expect(page.locator('#planted-inline')).toHaveCount(0)
})

test('a protocol-relative link does not leave Relay', async ({ page }) => {
  const { project, pages } = await seed(page, [
    { title: 'Link', body: '[Read the doc](//evil.example/login)' },
  ])
  await openDoc(page, project.id, pages[0]!.id)
  const before = page.url()
  await page.getByText('Read the doc').click()
  await expect(page).toHaveURL(before)
})
