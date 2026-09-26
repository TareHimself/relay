import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupStores, tempStore } from '../test-support'

afterEach(cleanupStores)

describe('TokenService', () => {
  it('authenticates a token, stores only its hash and never lists the secret', async () => {
    const store = await tempStore()
    const created = store.tokens.create({ name: 'Claude', scope: 'write' })
    expect(created.token).toMatch(/^rly_[A-Za-z0-9_-]{40,}$/)
    expect(created.name).toBe('claude')

    expect(store.tokens.authenticate(created.token)).toEqual({
      kind: 'token',
      actor: 'claude',
      scope: 'write',
      projectId: null,
    })
    expect(store.tokens.authenticate(`${created.token}x`)).toBeNull()
    expect(JSON.stringify(store.tokens.list())).not.toContain(created.token)
    expect(store.tokens.list()[0]?.lastUsedAt).not.toBeNull()
  })

  it('never keeps the secret in the database file', async () => {
    const store = await tempStore()
    const created = store.tokens.create({ name: 'agent' })
    const db = new Database(join((store as unknown as { dataDir: string }).dataDir, 'state.db'), {
      readonly: true,
    })
    const rows = db.prepare('SELECT * FROM tokens').all()
    db.close()
    expect(JSON.stringify(rows)).not.toContain(created.token)
  })

  it('revokes and expires tokens', async () => {
    const store = await tempStore()
    const revoked = store.tokens.create({ name: 'revoked' })
    store.tokens.revoke(revoked.id)
    expect(store.tokens.authenticate(revoked.token)).toBeNull()
    expect(() => store.tokens.revoke(revoked.id)).toThrowError(/not found/)

    const expired = store.tokens.create({ name: 'expired', expiresAt: '2020-01-01T00:00:00.000Z' })
    expect(store.tokens.authenticate(expired.token)).toBeNull()
    expect(store.tokens.list().map((t) => t.name)).toEqual(['expired'])
  })

  it('rejects reserved and duplicate names and unknown projects, and frees a revoked name', async () => {
    const store = await tempStore()
    expect(() => store.tokens.create({ name: 'local' })).toThrowError(/reserved/)
    expect(() => store.tokens.create({ name: 'Bad Name!' })).toThrow()
    const first = store.tokens.create({ name: 'claude' })
    expect(() => store.tokens.create({ name: 'claude' })).toThrowError(/already exists/)
    expect(() => store.tokens.create({ name: 'scoped', projectId: 'missing' })).toThrowError(
      /Project not found/,
    )
    store.tokens.revoke(first.id)
    expect(store.tokens.create({ name: 'claude' }).name).toBe('claude')
  })

  it('carries scope and project restriction into the auth context', async () => {
    const store = await tempStore()
    const project = await store.createProject('Alpha', '', 'tare')
    const created = store.tokens.create({ name: 'reader', scope: 'read', projectId: project.id })
    expect(store.tokens.authenticate(created.token)).toMatchObject({
      scope: 'read',
      projectId: project.id,
    })
  })
})
