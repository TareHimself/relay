import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { leaveDiagramSource, revealedDiagramFences } from './diagramDone'

function stateAt(doc: string, cursor: string) {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.indexOf(cursor) + cursor.length),
    extensions: [markdown()],
  })
}

const doc =
  'intro\n\n```mermaid\ngraph TD\nA-->B\n```\n\n```js\nlet a\n```\n\n```svg\n<svg/>\n```\n'

describe('revealedDiagramFences', () => {
  it('lists the mermaid or svg fence the caret is inside', () => {
    expect(revealedDiagramFences(stateAt(doc, 'A-->B')).map((f) => f.opening.text)).toEqual([
      '```mermaid',
    ])
    expect(revealedDiagramFences(stateAt(doc, '<svg/>')).map((f) => f.opening.text)).toEqual([
      '```svg',
    ])
  })

  it('ignores plain code blocks and carets outside every diagram', () => {
    expect(revealedDiagramFences(stateAt(doc, 'let a'))).toEqual([])
    expect(revealedDiagramFences(stateAt(doc, 'intro'))).toEqual([])
  })

  it('ignores unclosed diagram fences', () => {
    expect(revealedDiagramFences(stateAt('```mermaid\ngraph TD', 'graph TD'))).toEqual([])
  })
})

describe('leaveDiagramSource', () => {
  it('moves the caret to the end of the closing fence so the diagram renders again', () => {
    const state = stateAt(doc, 'A-->B')
    const fence = revealedDiagramFences(state)[0]!
    const next = state.update(leaveDiagramSource(fence)).state
    expect(next.doc.toString()).toBe(doc)
    expect(next.selection.main.head).toBe(doc.indexOf('A-->B\n```') + 'A-->B\n```'.length)
    expect(revealedDiagramFences(next)).toEqual([])
  })
})
