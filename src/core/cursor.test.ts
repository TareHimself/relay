import { describe, expect, it } from 'vitest'
import { eventCursorOf } from './cursor'
import { newId } from './ids'

describe('eventCursorOf', () => {
  it('passes event ids through and treats missing as the start', () => {
    expect(eventCursorOf('abc123')).toBe('abc123')
    expect(eventCursorOf(undefined)).toBe('')
  })

  it('turns a timestamp into an id lower bound that orders correctly', () => {
    const before = newId()
    const cursor = eventCursorOf(new Date(Date.now() + 5).toISOString())
    const after = (() => {
      const until = Date.now() + 20
      while (Date.now() < until) continue
      return newId()
    })()
    expect(cursor).toMatch(/^[0-9a-f]{32}$/)
    expect(before < cursor).toBe(true)
    expect(after > cursor).toBe(true)
  })
})
