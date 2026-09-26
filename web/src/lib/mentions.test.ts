import { describe, expect, it } from 'vitest'
import { activeMention, insertMention, suggestPeople } from './mentions'

const people = [
  { handle: 'tare', displayName: 'Tare Belo', kind: 'user' as const },
  { handle: 'review-bot', displayName: 'review-bot', kind: 'agent' as const },
  { handle: 'rita', displayName: 'Rita', kind: 'agent' as const },
]

describe('activeMention', () => {
  it('finds the token being typed at the caret', () => {
    expect(activeMention('hi @re', 6)).toEqual({ start: 3, end: 6, query: 're' })
    expect(activeMention('@', 1)).toEqual({ start: 0, end: 1, query: '' })
    expect(activeMention('a\n@x', 4)).toEqual({ start: 2, end: 4, query: 'x' })
  })

  it('ignores emails, finished mentions and carets away from a token', () => {
    expect(activeMention('mail me@example', 15)).toBeNull()
    expect(activeMention('hi @rita please', 15)).toBeNull()
    expect(activeMention('hi @rita please', 8)).toEqual({ start: 3, end: 8, query: 'rita' })
    expect(activeMention('no mention', 10)).toBeNull()
  })
})

describe('suggestPeople', () => {
  it('ranks handle prefixes first, then name prefixes, then substrings', () => {
    expect(suggestPeople(people, 'r', undefined).map((p) => p.handle)).toEqual([
      'review-bot',
      'rita',
      'tare',
    ])
    expect(suggestPeople(people, 'belo', undefined).map((p) => p.handle)).toEqual(['tare'])
    expect(suggestPeople(people, 'zzz', undefined)).toEqual([])
  })

  it('lists everyone for a bare @ except the excluded handle', () => {
    expect(suggestPeople(people, '', 'tare').map((p) => p.handle)).toEqual(['review-bot', 'rita'])
  })
})

describe('insertMention', () => {
  it('replaces the token and adds a trailing space', () => {
    expect(insertMention('hi @re', { start: 3, end: 6, query: 're' }, 'review-bot')).toEqual({
      text: 'hi @review-bot ',
      caret: 15,
    })
  })

  it('reuses an existing space after the caret', () => {
    expect(insertMention('hi @re there', { start: 3, end: 6, query: 're' }, 'rita')).toEqual({
      text: 'hi @rita there',
      caret: 9,
    })
  })
})
