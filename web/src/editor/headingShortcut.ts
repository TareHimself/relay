import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText'])

export function needsHeadingSpace(lineBeforeCursor: string, typed: string): boolean {
  return /^#{1,6}$/.test(lineBeforeCursor) && /^[^\s#]$/u.test(typed)
}

export function insideCode(state: EditorState, pos: number): boolean {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node.parent; node = node.parent) {
    if (CODE_NODES.has(node.name)) return true
  }
  return false
}

export const headingShortcut: MarkdownExtension = {
  name: 'heading-shortcut',
  version: '1.0.0',
  extensions: [
    EditorView.inputHandler.of((view, from, to, text) => {
      if (from !== to) return false
      const line = view.state.doc.lineAt(from)
      if (!needsHeadingSpace(view.state.sliceDoc(line.from, from), text)) return false
      if (insideCode(view.state, from)) return false
      view.dispatch({
        changes: { from, insert: ` ${text}` },
        selection: { anchor: from + 1 + text.length },
        userEvent: 'input.type',
      })
      return true
    }),
  ],
}
