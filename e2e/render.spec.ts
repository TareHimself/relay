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
  await expect(page.locator('.cm-mermaid-block > svg')).toBeVisible()
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
  await page.mouse.move(target.x + target.width / 2, box.y + 2, { steps: 6 })
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 })
  await expect(inserter).toBeVisible()
  await inserter.click()
  await expect(page.locator('tbody tr')).toHaveCount(2)

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  const column = page.getByLabel('Insert column right')
  await expect(column).toBeVisible()
  const above = (await column.boundingBox())!
  await page.mouse.move(above.x - above.width, above.y + above.height / 2, { steps: 6 })
  await page.mouse.move(above.x + above.width / 2, above.y + above.height / 2, { steps: 6 })
  await expect(column).toBeVisible()
  await column.click()
  await expect(page.locator('thead th')).toHaveCount(3)
})

test('mermaid diagrams zoom into a lightbox and the source has a Done button', async ({ page }) => {
  const body = ['```mermaid', 'graph LR', '  Agent --> Relay --> Human', '```', '', 'after'].join(
    '\n',
  )
  const { project, pages } = await seed(page, [{ title: 'Zoom', body }])
  await openDoc(page, project.id, pages[0]!.id)
  const block = page.locator('.cm-mermaid-block')
  await expect(block.locator(':scope > svg')).toBeVisible()
  await block.hover()
  const zoom = page.getByRole('button', { name: 'Zoom diagram' })
  await expect(zoom).toBeVisible()
  await zoom.click()
  const lightbox = page.locator('.relay-lightbox')
  await expect(lightbox.locator('svg')).toBeVisible()
  await expect(page.locator('.mantine-Modal-content')).toHaveCSS('opacity', '1')
  const before = (await lightbox.locator('svg').boundingBox())!
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.locator('.mantine-Modal-title')).toContainText('125%')
  await expect
    .poll(async () => (await lightbox.locator('svg').boundingBox())!.width)
    .toBeCloseTo(before.width * 1.25, 0)
  await expect(page.locator('.relay-lightbox__diagram')).not.toHaveCSS(
    'transform',
    /scale|matrix\(1\.25/,
  )
  await page.keyboard.press('Escape')
  await expect(lightbox).toHaveCount(0)

  await block.hover()
  await block.locator('.cm-mermaid-edit').click()
  await expect(block).toHaveCount(0)
  const done = page.getByRole('button', { name: 'Done' })
  await expect(done).toBeVisible()
  await done.click()
  await expect(page.locator('.cm-mermaid-block > svg')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0)
})
