import { describe, expect, it } from 'vitest'
import { needsHeadingSpace } from './headingShortcut'

describe('needsHeadingSpace', () => {
  it('adds a space when text follows leading hashes', () => {
    expect(needsHeadingSpace('#', 'T')).toBe(true)
    expect(needsHeadingSpace('###', 'a')).toBe(true)
    expect(needsHeadingSpace('######', 'é')).toBe(true)
  })

  it('leaves everything else alone', () => {
    expect(needsHeadingSpace('#', ' ')).toBe(false)
    expect(needsHeadingSpace('#', '#')).toBe(false)
    expect(needsHeadingSpace('####### ', 'x')).toBe(false)
    expect(needsHeadingSpace('#######', 'x')).toBe(false)
    expect(needsHeadingSpace('# ', 'x')).toBe(false)
    expect(needsHeadingSpace('text #', 'x')).toBe(false)
    expect(needsHeadingSpace('', 'x')).toBe(false)
  })
})
