import { StateEffect, StateField, type EditorState } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'
import type { TextRange } from '@shared/anchors'

export const DRAFT_ID = '__draft__'

export interface CommentMark extends TextRange {
  id: string
  active?: boolean
}

export interface EditorBridge {
  attach: (view: EditorView) => void
  detach: () => void
  changed: () => void
  activate: (threadId: string) => void
}

export const setCommentMarks = StateEffect.define<readonly CommentMark[]>()

function classFor(mark: CommentMark): string {
  if (mark.id === DRAFT_ID) return 'relay-comment relay-comment--draft'
  return mark.active ? 'relay-comment relay-comment--active' : 'relay-comment'
}

function buildMarks(marks: readonly CommentMark[]): DecorationSet {
  return Decoration.set(
    marks
      .filter((mark) => mark.to > mark.from)
      .map((mark) =>
        Decoration.mark({ class: classFor(mark), commentId: mark.id }).range(mark.from, mark.to),
      ),
    true,
  )
}

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    let next = marks.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (effect.is(setCommentMarks)) next = buildMarks(effect.value)
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

export function markRanges(state: EditorState): Map<string, TextRange> {
  const ranges = new Map<string, TextRange>()
  state.field(marksField).between(0, state.doc.length, (from, to, value) => {
    ranges.set(value.spec.commentId as string, { from, to })
  })
  return ranges
}

export function commentsExtension(bridge: EditorBridge): MarkdownExtension {
  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        bridge.attach(view)
      }
      update(update: ViewUpdate) {
        const marksChanged = update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(setCommentMarks)),
        )
        if (
          marksChanged ||
          update.docChanged ||
          update.viewportChanged ||
          update.geometryChanged ||
          update.selectionSet
        )
          bridge.changed()
      }
      destroy() {
        bridge.detach()
      }
    },
  )
  const clicks = EditorView.domEventHandlers({
    click(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return false
      for (const [id, range] of markRanges(view.state)) {
        if (id !== DRAFT_ID && pos >= range.from && pos <= range.to) {
          bridge.activate(id)
          break
        }
      }
      return false
    },
  })
  return { name: 'relay-comments', version: '1.0.0', extensions: [marksField, plugin, clicks] }
}
