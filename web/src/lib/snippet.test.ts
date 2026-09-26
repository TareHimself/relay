import { describe, expect, it } from 'vitest'
import { splitSnippet } from './snippet'

describe('splitSnippet', () => {
  it('splits highlighted words from the surrounding text', () => {
    expect(splitSnippet('work \u0001stealing\u0002 deques \u0001and\u0002 more')).toEqual([
      { text: 'work ', match: false },
      { text: 'stealing', match: true },
      { text: ' deques ', match: false },
      { text: 'and', match: true },
      { text: ' more', match: false },
    ])
  })

  it('passes plain text and empty input through', () => {
    expect(splitSnippet('no matches here')).toEqual([{ text: 'no matches here', match: false }])
    expect(splitSnippet('')).toEqual([])
  })

  it('never renders markup from the document, and copes with a missing end marker', () => {
    expect(splitSnippet('<b>x</b> \u0001y\u0002')).toEqual([
      { text: '<b>x</b> ', match: false },
      { text: 'y', match: true },
    ])
    expect(splitSnippet('a \u0001broken')).toEqual([
      { text: 'a ', match: false },
      { text: 'broken', match: false },
    ])
  })
})
