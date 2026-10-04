import type { EditorView } from '@codemirror/view'
import type { CommentDraft } from '../stores/uiStore'

const CONTEXT_LENGTH = 32
const EDITING_CELL = '[data-cell-from][contenteditable]'

export interface CellSelection {
  draft: CommentDraft
  rect: DOMRect
}

function rawOffsets(raw: string): number[] {
  const offsets: number[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && raw[i + 1] === '|') continue
    offsets.push(i)
  }
  offsets.push(raw.length)
  return offsets
}

function textOffset(cell: Element, container: Node, offset: number): number {
  const probe = document.createRange()
  probe.selectNodeContents(cell)
  probe.setEnd(container, offset)
  return probe.toString().length
}

export function cellSelection(view: EditorView): CellSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const start = range.startContainer
  const cell = (start instanceof Element ? start : start.parentElement)?.closest(EDITING_CELL)
  if (!cell || !cell.contains(range.endContainer) || !view.dom.contains(cell)) return null

  const cellFrom = Number((cell as HTMLElement).dataset.cellFrom)
  const line = view.state.doc.lineAt(cellFrom)
  const raw = view.state
    .sliceDoc(cellFrom, line.to)
    .split(/(?<!\\)\|/, 1)
    .join('')
    .trimEnd()
  const offsets = rawOffsets(raw)
  const text = cell.textContent ?? ''
  const cellLength = offsets.length - 1
  if (text.length !== cellLength) return null

  const startOffset = textOffset(cell, range.startContainer, range.startOffset)
  const endOffset = textOffset(cell, range.endContainer, range.endOffset)
  const from = cellFrom + (offsets[startOffset] ?? 0)
  const to = cellFrom + (offsets[endOffset] ?? 0)
  const exact = view.state.sliceDoc(from, to).trim()
  if (!exact) return null
  const slice = view.state.sliceDoc(from, to)
  const trimmedFrom = from + (slice.length - slice.trimStart().length)
  return {
    draft: {
      exact,
      from: trimmedFrom,
      prefix: view.state.sliceDoc(Math.max(0, trimmedFrom - CONTEXT_LENGTH), trimmedFrom),
      suffix: view.state.sliceDoc(
        trimmedFrom + exact.length,
        trimmedFrom + exact.length + CONTEXT_LENGTH,
      ),
    },
    rect: range.getBoundingClientRect(),
  }
}
