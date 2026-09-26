import { describe, expect, it } from 'vitest'
import { assertPasswordStrength, hashPassword, verifyPassword } from './password'

describe('passwords', () => {
  it('hashes with a random salt and verifies only the right password', async () => {
    const first = await hashPassword('correct horse battery')
    const second = await hashPassword('correct horse battery')
    expect(first).toMatch(/^scrypt\$16384\$8\$1\$/)
    expect(first).not.toBe(second)
    expect(first).not.toContain('correct horse')
    expect(await verifyPassword('correct horse battery', first)).toBe(true)
    expect(await verifyPassword('correct horse batterx', first)).toBe(false)
    expect(await verifyPassword('', first)).toBe(false)
  })

  it('treats unicode-equivalent passwords as equal', async () => {
    const hash = await hashPassword('pässword-ünïcode')
    expect(await verifyPassword('pässword-ünı̈code'.replace('ı', 'i'), hash)).toBe(true)
  })

  it('rejects malformed hashes without throwing', async () => {
    expect(await verifyPassword('anything', 'plaintext')).toBe(false)
    expect(await verifyPassword('anything', 'scrypt$1$2')).toBe(false)
  })

  it('enforces length limits', () => {
    expect(() => assertPasswordStrength('short')).toThrowError(/at least 8/)
    expect(() => assertPasswordStrength('x'.repeat(201))).toThrowError(/at most 200/)
    expect(() => assertPasswordStrength('long enough')).not.toThrow()
  })
})
