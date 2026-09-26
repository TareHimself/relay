import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { linkAt, linkDraftFromSelection, linkMarkdown, normalizeLink } from './link'

describe('normalizeLink', () => {
  it('keeps full URLs and adds https to bare domains', () => {
    expect(normalizeLink('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(normalizeLink(' example.com/docs ')).toBe('https://example.com/docs')
    expect(normalizeLink('mailto:me@example.com')).toBe('mailto:me@example.com')
  })

  it('turns email addresses into mailto links and keeps relative and anchor links', () => {
    expect(normalizeLink('me@example.com')).toBe('mailto:me@example.com')
    expect(normalizeLink('#section')).toBe('#section')
    expect(normalizeLink('/projects/1')).toBe('/projects/1')
  })

  it('encodes characters that would break markdown and rejects unsafe schemes', () => {
    expect(normalizeLink('example.com/a b(c)')).toBe('https://example.com/a%20b%28c%29')
    expect(normalizeLink('javascript:alert(1)')).toBeNull()
    expect(normalizeLink('DATA:text/html,x')).toBeNull()
    expect(normalizeLink('   ')).toBeNull()
  })
})

describe('linkAt', () => {
  const line = 'See [the docs](https://x.y/z) and ![img](a.png) now'

  it('finds the markdown link around a range', () => {
    expect(linkAt(line, 8, 8)).toEqual({
      from: 4,
      to: 29,
      label: 'the docs',
      url: 'https://x.y/z',
    })
    expect(linkAt(line, 5, 12)?.label).toBe('the docs')
  })

  it('ignores positions outside a link and images', () => {
    expect(linkAt(line, 0, 2)).toBeNull()
    expect(linkAt(line, 36, 36)).toBeNull()
    expect(linkAt(line, 30, 45)).toBeNull()
  })
})

describe('linkMarkdown', () => {
  it('strips brackets from the label', () => {
    expect(linkMarkdown('a [b]', 'https://x.y')).toBe('[a b](https://x.y)')
  })
})

describe('linkDraftFromSelection', () => {
  it('describes a plain selection', () => {
    const state = EditorState.create({ doc: 'hello world', selection: { anchor: 0, head: 5 } })
    expect(linkDraftFromSelection(state)).toEqual({
      from: 0,
      to: 5,
      label: 'hello',
      url: '',
      editing: false,
    })
  })

  it('prefills a selected URL and switches to editing inside an existing link', () => {
    const url = EditorState.create({ doc: 'https://a.b/c', selection: { anchor: 0, head: 13 } })
    expect(linkDraftFromSelection(url).url).toBe('https://a.b/c')
    const inside = EditorState.create({ doc: 'x [t](https://a.b) y', selection: { anchor: 4 } })
    expect(linkDraftFromSelection(inside)).toEqual({
      from: 2,
      to: 18,
      label: 't',
      url: 'https://a.b',
      editing: true,
    })
  })
})
