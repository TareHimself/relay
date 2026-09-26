import { describe, expect, it } from 'vitest'
import { LoginThrottle } from './throttle'

describe('LoginThrottle', () => {
  it('allows a few failures, then blocks with growing delays', () => {
    let now = 0
    const throttle = new LoginThrottle(() => now)
    for (let i = 0; i < 4; i++) throttle.fail('ip')
    expect(throttle.retryAfterSeconds('ip')).toBe(0)
    throttle.fail('ip')
    expect(throttle.retryAfterSeconds('ip')).toBe(30)
    now += 31_000
    expect(throttle.retryAfterSeconds('ip')).toBe(0)
    throttle.fail('ip')
    expect(throttle.retryAfterSeconds('ip')).toBe(60)
  })

  it('tracks clients separately and resets on success', () => {
    const throttle = new LoginThrottle(() => 0)
    for (let i = 0; i < 5; i++) throttle.fail('a')
    expect(throttle.retryAfterSeconds('a')).toBeGreaterThan(0)
    expect(throttle.retryAfterSeconds('b')).toBe(0)
    throttle.reset('a')
    expect(throttle.retryAfterSeconds('a')).toBe(0)
  })

  it('forgets failures after the window passes', () => {
    let now = 0
    const throttle = new LoginThrottle(() => now)
    for (let i = 0; i < 5; i++) throttle.fail('ip')
    now += 16 * 60 * 1000
    throttle.fail('ip')
    expect(throttle.retryAfterSeconds('ip')).toBe(0)
  })
})
