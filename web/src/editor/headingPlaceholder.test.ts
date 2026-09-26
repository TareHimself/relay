import { describe, expect, it } from 'vitest'
import { placeholderFor } from './headingPlaceholder'

describe('placeholderFor', () => {
  it('names the heading level for a line of only hashes', () => {
    expect(placeholderFor('#')).toBe('Heading 1')
    expect(placeholderFor('###')).toBe('Heading 3')
    expect(placeholderFor('## ')).toBe('Heading 2')
    expect(placeholderFor('######')).toBe('Heading 6')
  })

  it('shows nothing once there is a title or for non-headings', () => {
    expect(placeholderFor('## Title')).toBeNull()
    expect(placeholderFor('#######')).toBeNull()
    expect(placeholderFor('text #')).toBeNull()
    expect(placeholderFor('')).toBeNull()
    expect(placeholderFor('  ##')).toBeNull()
  })
})
