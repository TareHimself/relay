import { describe, expect, it } from 'vitest'
import { newId } from './ids'

describe('newId', () => {
  it('is 32 lowercase hex characters without dashes', () => {
    expect(newId()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('sorts in creation order', () => {
    const ids = Array.from({ length: 200 }, () => newId())
    expect([...ids].sort()).toEqual(ids)
  })
})
