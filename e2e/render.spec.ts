import { expect, test } from '@playwright/test'
import { openDoc, seed } from './helpers'

test('svg fences, data-uri images and mermaid render', async ({ page }) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="15" fill="#5c7cfa"/></svg>'
  const body = [
    '```svg',
    svg,
    '```',
    '',
    `![dot](data:image/svg+xml;utf8,${encodeURIComponent(svg)})`,
    '',
    '```mermaid',
    'graph LR',
    '  Agent --> Relay --> Human',
    '```',
  ].join('\n')
  const { project, pages } = await seed(page, [{ title: 'Render', body }])
  await openDoc(page, project.id, pages[0]!.id)
  await expect(page.locator('.relay-svg-block img')).toBeVisible()
  await expect(page.locator('.cm-mermaid-block svg')).toBeVisible()
  await expect(page.locator('img[src^="data:image/svg+xml"]').nth(1)).toBeVisible()
})

test('table cell text can be commented on', async ({ page }) => {
  const body = '| head | other |\n| - | - |\n| selectable words | x |'
  const { project, pages } = await seed(page, [{ title: 'Table', body }])
  await openDoc(page, project.id, pages[0]!.id)
  const cell = page.locator('td', { hasText: 'selectable words' })
  await cell.click()
  await expect(cell).toHaveAttribute('contenteditable', 'plaintext-only')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await expect(page.getByRole('button', { name: 'Comment' }).filter({ visible: true })).toHaveCount(
    1,
  )
})

test('table hover buttons can be reached and clicked', async ({ page }) => {
  const body = '| head | other |\n| - | - |\n| one | two |'
  const { project, pages } = await seed(page, [{ title: 'Table', body }])
  await openDoc(page, project.id, pages[0]!.id)
  const box = (await page.locator('td', { hasText: 'one' }).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  const inserter = page.getByLabel('Insert row below')
  await expect(inserter).toBeVisible()
  const target = (await inserter.boundingBox())!
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 })
  await expect(inserter).toBeVisible()
  await inserter.click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
})
