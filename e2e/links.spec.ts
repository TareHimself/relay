import { expect, test, type Page } from '@playwright/test'
import { ORIGIN, openDoc, seed } from './helpers'

async function realClick(page: Page, selector: string, text: string) {
  const box = await page.locator(selector, { hasText: text }).first().boundingBox()
  if (!box) throw new Error(`no box for ${text}`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x - 30, y, { steps: 3 })
  await page.mouse.move(x, y, { steps: 3 })
  await page.mouse.down()
  await page.waitForTimeout(60)
  await page.mouse.up()
}

const BODY = [
  'inline [Inline label](https://example.com/inline) end',
  '',
  'bare https://example.com/bare end',
  '',
  'angle <https://example.com/angle> end',
  '',
  'ref [Reference label][r] end',
  '',
  '[r]: https://example.com/ref',
  '',
  '| a | b |',
  '| - | - |',
  '| [Table label](https://example.com/table) | x |',
].join('\n')

test.describe('links', () => {
  test('every link form opens on a plain click', async ({ page, context }) => {
    const { project, pages } = await seed(page, [{ title: 'Links', body: BODY }])
    await openDoc(page, project.id, pages[0]!.id)
    const cases: [string, string][] = [
      ['Inline label', 'https://example.com/inline'],
      ['https://example.com/bare', 'https://example.com/bare'],
      ['https://example.com/angle', 'https://example.com/angle'],
      ['Reference label', 'https://example.com/ref'],
      ['Table label', 'https://example.com/table'],
    ]
    for (const [text, url] of cases) {
      const popup = context.waitForEvent('page')
      await realClick(page, '.cm-link', text)
      const opened = await popup
      expect(opened.url(), text).toBe(url)
      await opened.close()
    }
  })

  test('a link to a Relay doc navigates inside the app', async ({ page }) => {
    const { project, pages } = await seed(page, [
      { title: 'Target', body: 'target body' },
      { title: 'Source', body: 'go [there](/doc/PLACEHOLDER)' },
    ])
    const target = pages[0]!
    await page.request.patch(`/api/pages/${pages[1]!.id}`, {
      headers: { origin: ORIGIN },
      data: { edits: [{ find: 'PLACEHOLDER', replace: target.id }] },
    })
    await openDoc(page, project.id, pages[1]!.id)
    await realClick(page, '.cm-link', 'there')
    await expect(page).toHaveURL(new RegExp(`/docs/${target.id}$`))
    await expect(page.locator('.cm-content')).toContainText('target body')
  })

  test('hover card stays open while moving from the link to the card', async ({ page }) => {
    const { project, pages } = await seed(page, [
      { title: 'Hover', body: 'a [Hover me](https://example.com/h) b' },
    ])
    await openDoc(page, project.id, pages[0]!.id)
    const box = (await page.locator('.cm-link').first().boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x - 60, y)
    await page.mouse.move(x, y, { steps: 5 })
    const edit = page.getByLabel('Edit link')
    await expect(edit).toBeVisible()
    const card = (await edit.boundingBox())!
    const tx = card.x + card.width / 2
    const ty = card.y + card.height / 2
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(x + ((tx - x) * i) / 20, y + ((ty - y) * i) / 20)
      await page.waitForTimeout(40)
    }
    await expect(edit).toBeVisible()
  })

  test('clicking past a trailing link starts a new paragraph instead of editing the URL', async ({
    page,
  }) => {
    const { project, pages } = await seed(page, [
      { title: 'Trailing', body: 'intro\n\n[Last link](https://example.com/last)' },
    ])
    await openDoc(page, project.id, pages[0]!.id)
    const box = (await page.locator('.cm-link').first().boundingBox())!
    await page.mouse.click(box.x + box.width + 120, box.y + box.height / 2)
    await page.keyboard.type('TYPED')
    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/pages/${pages[0]!.id}`)
        return ((await response.json()) as { body: string }).body
      })
      .toContain('(https://example.com/last)\n\nTYPED')
  })
})
