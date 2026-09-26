import { describe, expect, it } from 'vitest'
import { excerptOf } from './excerpt'

describe('excerptOf', () => {
  it('skips frontmatter and strips common markdown syntax', () => {
    const markdown = [
      '---',
      'id: 1',
      'title: T',
      '---',
      '',
      '# Heading',
      '',
      'Some **bold** and _italic_ text with a [link](https://example.com).',
      '',
      '- [ ] a task',
      '1. numbered',
      '> a quote',
    ].join('\n')
    expect(excerptOf(markdown)).toBe(
      'Heading Some bold and italic text with a link. a task numbered a quote',
    )
  })

  it('treats hashes without a space as heading markers', () => {
    expect(excerptOf('Today is good\n\n##Title\n\n#Another')).toBe('Today is good Title Another')
  })

  it('drops code fences, images, comments, html and table rules', () => {
    const markdown =
      'Intro\n\n```js\nconst x = 1\n```\n\n![alt](a.png) <!-- note --> <b>bold</b>\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n---\n\nEnd'
    expect(excerptOf(markdown)).toBe('Intro bold A B 1 2 End')
  })

  it('handles callouts, footnotes, wiki links, highlights and escapes', () => {
    const markdown =
      '> [!NOTE]\n> Careful here[^1]\n\nSee [[Other page|the other page]] and [[Plain]]; ==marked== and ~~gone~~ and \\*literal\\*.\n\n[^1]: the note'
    expect(excerptOf(markdown)).toBe(
      'Careful here See the other page and Plain; marked and gone and literal. the note',
    )
  })

  it('keeps identifiers with underscores and asterisk math intact', () => {
    expect(excerptOf('call snake_case_name and use `inline_code` with 2 * 3 * 4')).toBe(
      'call snake_case_name and use inline_code with 2 * 3 * 4',
    )
  })

  it('truncates long text with an ellipsis', () => {
    const result = excerptOf('word '.repeat(100), 50)
    expect(result).toHaveLength(50)
    expect(result.endsWith('…')).toBe(true)
  })

  it('returns an empty string for empty pages', () => {
    expect(excerptOf('---\nid: 1\n---\n\n')).toBe('')
  })
})
