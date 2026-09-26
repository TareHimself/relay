import type { EditorView } from '@codemirror/view'
import type { CommentDraft } from '../stores/uiStore'

const CONTEXT_LENGTH = 32

export function draftFromSelection(view: EditorView): CommentDraft | null {
  const { from, to } = view.state.selection.main
  const raw = view.state.sliceDoc(from, to)
  const exact = raw.trim()
  if (!exact) return null
  const start = from + (raw.length - raw.trimStart().length)
  return {
    exact,
    from: start,
    prefix: view.state.sliceDoc(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: view.state.sliceDoc(start + exact.length, start + exact.length + CONTEXT_LENGTH),
  }
}
