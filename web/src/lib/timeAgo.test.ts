import { describe, expect, it } from 'vitest'
import { timeAgo } from './timeAgo'

const now = Date.parse('2026-09-25T12:00:00Z')
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString()

describe('timeAgo', () => {
  it('says just now for recent times', () => {
    expect(timeAgo(ago(10), now)).toBe('just now')
  })

  it('uses the largest fitting unit', () => {
    expect(timeAgo(ago(5 * 60), now)).toMatch(/5 min/)
    expect(timeAgo(ago(3 * 3600), now)).toMatch(/3 hr/)
    expect(timeAgo(ago(3 * 86_400), now)).toMatch(/3 days/)
  })

  it('never reads as zero minutes', () => {
    expect(timeAgo(ago(50), now)).toMatch(/1 min/)
  })
})
