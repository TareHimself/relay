import { describe, expect, it } from 'vitest'
import { lineDiff } from './lineDiff'

describe('lineDiff', () => {
  it('reports nothing for identical text', () => {
    expect(lineDiff('a\nb\n', 'a\nb\n')).toEqual({ lines: [], added: 0, removed: 0 })
  })

  it('marks a replaced line as one removal and one addition with context around it', () => {
    const result = lineDiff('one\ntwo\nthree\n', 'one\nTWO\nthree\n')!
    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
    expect(result.lines).toEqual([
      { kind: 'ctx', text: 'one' },
      { kind: 'del', text: 'two' },
      { kind: 'add', text: 'TWO' },
      { kind: 'ctx', text: 'three' },
    ])
  })

  it('handles insertions, deletions and text with no trailing newline', () => {
    const result = lineDiff('a\nc', 'a\nb\nc\nd')!
    expect(result.lines.filter((line) => line.kind === 'add').map((line) => line.text)).toEqual([
      'b',
      'd',
    ])
    expect(result.removed).toBe(0)
  })

  it('collapses long unchanged stretches into a gap line', () => {
    const many = Array.from({ length: 30 }, (_, i) => `line ${i}`)
    const changed = [...many]
    changed[0] = 'first changed'
    changed[29] = 'last changed'
    const result = lineDiff(many.join('\n'), changed.join('\n'))!
    const gap = result.lines.find((line) => line.kind === 'gap')
    expect(gap).toEqual({ kind: 'gap', text: '24 unchanged lines' })
    expect(result.lines.length).toBeLessThan(14)
  })

  it('gives up on very large rewrites instead of freezing', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n')
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n')
    expect(lineDiff(a, b)).toBeNull()
  })
})
