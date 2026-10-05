import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openDoc, seed } from './helpers'

function readZip(zip: Buffer) {
  const entries: Record<string, string> = {}
  let offset = 0
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18)
    const nameLength = zip.readUInt16LE(offset + 26)
    const start = offset + 30 + nameLength
    entries[zip.subarray(offset + 30, start).toString('utf8')] = zip
      .subarray(start, start + size)
      .toString('utf8')
    offset = start + size
  }
  return entries
}

test('a page downloads as markdown with its title as a heading', async ({ page }) => {
  const { project, pages } = await seed(page, [
    { title: 'Export Me', body: 'Some **bold** text.\n\n```mermaid\ngraph LR\n  A --> B\n```' },
  ])
  await openDoc(page, project.id, pages[0]!.id)
  await page.getByLabel('More actions').click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download .md' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('export-me.md')
  const text = await readFile((await download.path())!, 'utf8')
  expect(text).toBe('# Export Me\n\nSome **bold** text.\n\n```mermaid\ngraph LR\n  A --> B\n```\n')
})

test('selected pages export as a zip, and the whole project exports without a selection', async ({
  page,
}) => {
  const { project } = await seed(page, [
    { title: 'Alpha', body: 'alpha body' },
    { title: 'Beta', body: 'beta body' },
    { title: 'Gamma', body: 'gamma body' },
  ])
  await page.goto(`/projects/${project.id}`)
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByLabel('Select Alpha').click()
  await page.getByLabel('Select Gamma').click()
  await expect(page.getByText('2 selected')).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download .zip' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.zip$/)
  const picked = readZip(await readFile((await download.path())!))
  expect(Object.keys(picked).sort()).toEqual(['alpha.md', 'gamma.md'])
  expect(picked['alpha.md']).toBe('# Alpha\n\nalpha body\n')

  const all = await page.request.get(`/api/projects/${project.id}/export`)
  expect(all.headers()['content-type']).toBe('application/zip')
  expect(Object.keys(readZip(await all.body())).sort()).toEqual(['alpha.md', 'beta.md', 'gamma.md'])
})

test('undo reverts typing in the editor', async ({ page }) => {
  const { project, pages } = await seed(page, [{ title: 'Undo', body: 'start' }])
  await openDoc(page, project.id, pages[0]!.id)
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' added text')
  await expect(page.locator('.cm-content')).toContainText('start added text')
  await page.keyboard.press('Control+z')
  await expect(page.locator('.cm-content')).not.toContainText('added text')
  await page.keyboard.press('Control+y')
  await expect(page.locator('.cm-content')).toContainText('start added text')
})

test('exporting with ids that match no pages is rejected', async ({ page }) => {
  const { project } = await seed(page, [{ title: 'Alpha', body: 'x' }])
  const empty = await page.request.get(`/api/projects/${project.id}/export?ids=nope`)
  expect(empty.status()).toBe(400)
})
