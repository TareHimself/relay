import { expect, type Page } from '@playwright/test'

export const ORIGIN = 'http://127.0.0.1:47998'
const ADMIN = { handle: 'tare', password: 'e2e-password-123456' }
const headers = { origin: ORIGIN }
let counter = 0

export async function login(page: Page) {
  const response = await page.request.post('/api/login', { data: ADMIN })
  expect(response.ok()).toBe(true)
}

export async function seed(page: Page, pages: { title: string; body: string }[]) {
  await login(page)
  counter += 1
  const project = (await (
    await page.request.post('/api/projects', {
      headers,
      data: { name: `Project ${counter} ${Date.now()}` },
    })
  ).json()) as { id: string; name: string }
  const created: { id: string; title: string }[] = []
  for (const input of pages) {
    const response = await page.request.post(`/api/projects/${project.id}/pages`, {
      headers,
      data: input,
    })
    expect(response.ok()).toBe(true)
    created.push(await response.json())
  }
  return { project, pages: created }
}

export async function mintToken(page: Page, name: string, scope: 'read' | 'write' = 'write') {
  const response = await page.request.post('/api/tokens', {
    headers,
    data: { name: `${name}-${Date.now()}`, scope },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { token: string }).token
}

export const docUrl = (projectId: string, pageId: string) => `/projects/${projectId}/docs/${pageId}`

export async function openDoc(page: Page, projectId: string, pageId: string) {
  await page.goto(docUrl(projectId, pageId))
  await page.locator('.cm-content').waitFor()
}
