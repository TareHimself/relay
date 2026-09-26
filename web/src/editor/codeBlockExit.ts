import { EditorSelection, Prec, type EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'
import { fencedCodeAt } from './fences'

export type ExitTrigger = 'force' | 'arrow-down' | 'enter'

export function codeBlockExit(state: EditorState, trigger: ExitTrigger): TransactionSpec | null {
  const selection = state.selection.main
  if (!selection.empty) return null
  const fence = fencedCodeAt(state, selection.head)
  if (!fence) return null

  const doc = state.doc
  const { opening, closing, marker } = fence
  const cursor = doc.lineAt(selection.head)
  if (cursor.number === opening.number) return null
  if (closing && cursor.number > closing.number) return null
  const lastContent = closing ? doc.line(closing.number - 1) : doc.lineAt(fence.to)

  if (trigger !== 'force') {
    if (closing && cursor.number === closing.number) return null
    if (cursor.number !== lastContent.number) return null
  }
  if (trigger === 'enter' && (cursor.text.trim() !== '' || cursor.number <= opening.number + 1))
    return null

  const edits: Array<{ from: number; to?: number; insert?: string }> = []
  if (trigger === 'enter') edits.push({ from: cursor.from - 1, to: cursor.to })

  let target: number
  if (closing) {
    edits.push({ from: closing.to, insert: '\n' })
    target = closing.to
  } else {
    edits.push({ from: doc.length, insert: `\n${marker}\n` })
    target = doc.length
  }

  const changes = state.changes(edits)
  return {
    changes,
    selection: EditorSelection.cursor(changes.mapPos(target, 1)),
    scrollIntoView: true,
    userEvent: 'input',
  }
}

function command(trigger: ExitTrigger) {
  return (view: EditorView) => {
    const spec = codeBlockExit(view.state, trigger)
    if (!spec) return false
    view.dispatch(spec)
    return true
  }
}

export const codeBlockExitKeys: MarkdownExtension = {
  name: 'code-block-exit',
  version: '1.0.0',
  extensions: [
    Prec.highest(
      EditorView.domEventHandlers({
        keydown(event, view) {
          if (event.key !== 'Enter' || event.shiftKey || event.altKey) return false
          const trigger = event.ctrlKey || event.metaKey ? 'force' : 'enter'
          if (!command(trigger)(view)) return false
          event.preventDefault()
          return true
        },
      }),
    ),
    Prec.highest(keymap.of([{ key: 'ArrowDown', run: command('arrow-down') }])),
  ],
}
