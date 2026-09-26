import { describe, expect, it } from 'vitest'
import { activeHeading, containsIndex, outlineOf, outlineTree } from './outline'

describe('outlineOf', () => {
  it('lists headings with their level, title and source offset', () => {
    const text = '# Title\n\nIntro\n\n## Part **one**\n\n### Deep dive\n'
    expect(outlineOf(text)).toEqual([
      { level: 1, title: 'Title', from: 0 },
      { level: 2, title: 'Part one', from: text.indexOf('## Part') },
      { level: 3, title: 'Deep dive', from: text.indexOf('### Deep') },
    ])
  })

  it('ignores headings inside fenced code and lines without a space after the hashes', () => {
    const text =
      '## Real\n\n```md\n# not a heading\n```\n\n~~~\n## also not\n~~~\n\n#NoSpace\n\n## After\n'
    expect(outlineOf(text).map((item) => item.title)).toEqual(['Real', 'After'])
  })

  it('handles closing hashes, links, inline code and empty headings', () => {
    const text = '## Setup ##\n\n### The [docs](https://x.y) and `code`\n\n##   \n'
    expect(outlineOf(text).map((item) => item.title)).toEqual(['Setup', 'The docs and code'])
  })

  it('closes a longer fence only with a matching marker', () => {
    const text = '````\n```\n# inside\n```\n````\n# Outside\n'
    expect(outlineOf(text).map((item) => item.title)).toEqual(['Outside'])
  })
})

describe('outlineTree', () => {
  const heading = (level: number, title: string) => ({ level, title, from: 0 })

  it('nests headings under the closest shallower heading', () => {
    const tree = outlineTree([
      heading(2, 'A'),
      heading(3, 'A1'),
      heading(4, 'A1a'),
      heading(3, 'A2'),
      heading(2, 'B'),
    ])
    expect(tree.map((node) => node.item.title)).toEqual(['A', 'B'])
    expect(tree[0]!.children.map((node) => node.item.title)).toEqual(['A1', 'A2'])
    expect(tree[0]!.children[0]!.children.map((node) => node.item.title)).toEqual(['A1a'])
  })

  it('handles skipped levels and a first heading that is not the shallowest', () => {
    const tree = outlineTree([heading(3, 'Deep'), heading(1, 'Top'), heading(3, 'Skip')])
    expect(tree.map((node) => node.item.title)).toEqual(['Deep', 'Top'])
    expect(tree[1]!.children.map((node) => node.item.title)).toEqual(['Skip'])
  })

  it('finds an index anywhere in a subtree', () => {
    const [a] = outlineTree([heading(2, 'A'), heading(3, 'A1'), heading(2, 'B')])
    expect(containsIndex(a!, 1)).toBe(true)
    expect(containsIndex(a!, 2)).toBe(false)
  })
})

describe('activeHeading', () => {
  it('picks the last heading at or above the threshold', () => {
    expect(activeHeading([-300, -20, 90, 400], 120)).toBe(2)
    expect(activeHeading([null, 40], 120)).toBe(1)
  })

  it('falls back to the first heading above the first one and to the last at the bottom', () => {
    expect(activeHeading([200, 500], 120)).toBe(0)
    expect(activeHeading([-300, 200, 500], 120, true)).toBe(2)
    expect(activeHeading([], 120)).toBe(-1)
  })
})
