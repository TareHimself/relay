import { describe, expect, it } from 'vitest'
import { applyEdits } from './edits'
import { replaceSection } from './sections'

const doc = [
  '# Title',
  '',
  'intro',
  '',
  '## Goals',
  '',
  'old goals',
  '',
  '### Sub goal',
  '',
  'nested',
  '',
  '## Risks',
  '',
  'old risks',
  '',
].join('\n')

describe('replaceSection', () => {
  it('replaces a middle section including its nested subsections', () => {
    expect(replaceSection(doc, 'Goals', 'new goals')).toBe(
      [
        '# Title',
        '',
        'intro',
        '',
        '## Goals',
        '',
        'new goals',
        '',
        '## Risks',
        '',
        'old risks',
        '',
      ].join('\n'),
    )
  })

  it('replaces the last section and keeps a single trailing newline', () => {
    expect(replaceSection(doc, 'Risks', 'fresh risks\n\n- a\n- b\n')).toBe(
      doc.replace('old risks\n', 'fresh risks\n\n- a\n- b\n'),
    )
  })

  it('accepts the heading with its hashes and lets a nested heading be targeted', () => {
    const result = replaceSection(doc, '### Sub goal', 'changed')
    expect(result).toContain('### Sub goal\n\nchanged\n\n## Risks')
    expect(result).toContain('old goals')
  })

  it('empties a section when the replacement is blank', () => {
    expect(replaceSection(doc, 'Goals', '')).toBe(
      ['# Title', '', 'intro', '', '## Goals', '', '## Risks', '', 'old risks', ''].join('\n'),
    )
  })

  it('ignores headings inside code fences', () => {
    const fenced = '## Real\n\ntext\n\n```md\n## Real\n```\n'
    expect(replaceSection(fenced, 'Real', 'x')).toBe('## Real\n\nx\n')
  })

  it('refuses missing and duplicate headings and returns the current text', () => {
    expect(() => replaceSection(doc, 'Nope', 'x')).toThrowError(/not found/)
    expect(() => replaceSection('## A\n\n1\n\n## A\n\n2\n', 'A', 'x')).toThrowError(
      /more than once/,
    )
  })
})

describe('applyEdits with sections', () => {
  it('mixes find and section edits in order', () => {
    const result = applyEdits(doc, [
      { find: 'intro', replace: 'hello' },
      { section: 'Risks', replace: 'none' },
    ])
    expect(result).toContain('hello')
    expect(result.endsWith('## Risks\n\nnone\n')).toBe(true)
  })
})
