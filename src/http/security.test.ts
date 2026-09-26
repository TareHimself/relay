import { afterEach, describe, expect, it } from 'vitest'
import { cleanupStores, tempStore } from '../test-support'
import { createApp } from './app'

afterEach(cleanupStores)

async function app() {
  const store = await tempStore()
  await store.accounts.bootstrapAdmin({ handle: 'tare', password: 'correct horse battery' })
  return createApp(store)
}

const json = { 'content-type': 'application/json', host: 'relay.test' }

describe('hardening', () => {
  it('sends browser security headers', async () => {
    const response = (await app()).request('/api/health', { headers: { host: 'relay.test' } })
    const headers = (await response).headers
    expect(headers.get('content-security-policy')).toContain("script-src 'self'")
    expect(headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('refuses cross-origin login and logout', async () => {
    const server = await app()
    const foreign = { ...json, origin: 'https://evil.example' }
    const login = await server.request('/api/login', {
      method: 'POST',
      headers: foreign,
      body: JSON.stringify({ password: 'correct horse battery' }),
    })
    expect(login.status).toBe(403)
    expect(login.headers.get('set-cookie')).toBeNull()
    expect((await server.request('/api/logout', { method: 'POST', headers: foreign })).status).toBe(
      403,
    )
  })

  it('rejects oversized request bodies', async () => {
    const server = await app()
    const response = await server.request('/api/login', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ password: 'x'.repeat(6 * 1024 * 1024) }),
    })
    expect(response.status).toBe(413)
  })
})
