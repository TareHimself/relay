import { describe, expect, it } from 'vitest'
import { resolveAnchor } from './anchors'
import { splitFrontmatter } from './frontmatter'

describe('resolveAnchor', () => {
  const text = 'first cat sat. second cat ran. third cat hid.'
  const anchor = { exact: 'cat', prefix: 'sat. second ', suffix: ' ran. third cat' }

  it('picks the occurrence whose surrounding text matches', () => {
    const from = text.indexOf('cat ran')
    expect(resolveAnchor(text, anchor, 0)).toEqual({ from, to: from + 3 })
  })

  it('falls back to the occurrence nearest the hint when context is equal', () => {
    const flat = { exact: 'ab', prefix: '', suffix: '' }
    expect(resolveAnchor('ab..ab..ab', flat, 7)).toEqual({ from: 8, to: 10 })
    expect(resolveAnchor('ab..ab..ab', flat, 3)).toEqual({ from: 4, to: 6 })
  })

  it('follows the quote after text is inserted before it', () => {
    const edited = `Intro added.\n${text}`
    const from = edited.indexOf('cat ran')
    expect(resolveAnchor(edited, anchor, 22)).toEqual({ from, to: from + 3 })
  })

  it('returns null when the quote is gone', () => {
    expect(resolveAnchor('nothing here', anchor, 0)).toBeNull()
  })
})

describe('splitFrontmatter', () => {
  it('splits the header block and one blank line from the body', () => {
    expect(splitFrontmatter('---\nid: 1\n---\n\n# Hi\n')).toEqual({
      head: '---\nid: 1\n---\n\n',
      body: '# Hi\n',
    })
  })

  it('leaves text without frontmatter untouched', () => {
    expect(splitFrontmatter('# Hi\n')).toEqual({ head: '', body: '# Hi\n' })
  })

  it('round-trips byte for byte', () => {
    const markdown = '---\r\nid: 1\r\n---\r\n\r\nBody\r\n'
    const { head, body } = splitFrontmatter(markdown)
    expect(head + body).toBe(markdown)
  })
})
