import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { codeBlockExit, type ExitTrigger } from './codeBlockExit'

function run(doc: string, cursor: number | string, trigger: ExitTrigger) {
  const head = typeof cursor === 'number' ? cursor : doc.indexOf(cursor) + cursor.length
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(head),
    extensions: [markdown()],
  })
  const spec = codeBlockExit(state, trigger)
  if (!spec) return null
  const next = state.update(spec).state
  return { doc: next.doc.toString(), head: next.selection.main.head }
}

describe('codeBlockExit', () => {
  const block = '```js\nlet a\nlet b\n```\n\nafter'

  it('exits from anywhere with the force trigger', () => {
    const result = run(block, 'let a', 'force')
    expect(result?.doc).toBe('```js\nlet a\nlet b\n```\n\n\nafter')
    expect(result?.head).toBe(block.indexOf('\n\nafter') + 1)
  })

  it('handles language tags with symbols', () => {
    const doc = '```c++\nasync def\nsecond line\n```\n\nafter'
    expect(run(doc, 'second line', 'force')?.head).toBe(doc.indexOf('\n\nafter') + 1)
  })

  it('adds a trailing line when the block ends the document', () => {
    const result = run('```\ncode\n```', 'code', 'force')
    expect(result?.doc).toBe('```\ncode\n```\n')
    expect(result?.head).toBe(result?.doc.length)
  })

  it('exits on ArrowDown only from the last code line', () => {
    expect(run(block, 'let a', 'arrow-down')).toBeNull()
    expect(run(block, 'let b', 'arrow-down')?.head).toBe(block.indexOf('\n\nafter') + 1)
  })

  it('exits on Enter from an empty last line and removes that line', () => {
    const doc = '```\ncode\n\n```\n\nafter'
    const result = run(doc, 'code\n', 'enter')
    expect(result?.doc).toBe('```\ncode\n```\n\n\nafter')
    expect(result?.head).toBe((result?.doc ?? '').indexOf('\n\n\nafter') + 1)
  })

  it('does not treat Enter on a non-empty line as an exit', () => {
    expect(run(block, 'let b', 'enter')).toBeNull()
  })

  it('closes an unclosed fence when exiting', () => {
    const result = run('```\ncode', 'code', 'force')
    expect(result?.doc).toBe('```\ncode\n```\n')
    expect(result?.head).toBe(result?.doc.length)
  })

  it('ignores the cursor outside code and on the opening fence', () => {
    expect(run(block, 'after', 'force')).toBeNull()
    expect(run(block, 3, 'force')).toBeNull()
  })
})
