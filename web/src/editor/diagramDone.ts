import {
  RangeSetBuilder,
  StateField,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'
import { fencedBlocks, type FenceInfo } from './fences'

const DIAGRAM_TAGS = new Set(['mermaid', 'svg'])
const CHECK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'

function diagramTag(fence: FenceInfo): string {
  return fence.opening.text
    .replace(/^\s*(`{3,}|~{3,})/, '')
    .trim()
    .toLowerCase()
}

function revealed(state: EditorState, fence: FenceInfo): boolean {
  const inside = (pos: number) => pos > fence.opening.from && pos < fence.to
  return state.selection.ranges.some((range) => inside(range.anchor) || inside(range.head))
}

export function revealedDiagramFences(state: EditorState): FenceInfo[] {
  return fencedBlocks(state).filter(
    (fence) => fence.closing && DIAGRAM_TAGS.has(diagramTag(fence)) && revealed(state, fence),
  )
}

export function leaveDiagramSource(fence: FenceInfo): TransactionSpec {
  return { selection: { anchor: fence.to }, scrollIntoView: true }
}

class DoneWidget extends WidgetType {
  constructor(private readonly fence: FenceInfo) {
    super()
  }

  eq(other: DoneWidget): boolean {
    return other.fence.to === this.fence.to
  }

  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'relay-done'
    button.innerHTML = `${CHECK_ICON}<span>Done</span>`
    button.title = 'Finish editing and show the diagram'
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      view.dispatch(leaveDiagramSource(this.fence))
      view.focus()
    })
    return button
  }

  ignoreEvent(): boolean {
    return true
  }
}

function buildButtons(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const fence of revealedDiagramFences(state)) {
    const widget = new DoneWidget(fence)
    builder.add(fence.opening.to, fence.opening.to, Decoration.widget({ widget, side: 2 }))
  }
  return builder.finish()
}

const buttons = StateField.define<DecorationSet>({
  create: buildButtons,
  update: (value, transaction) =>
    transaction.docChanged || transaction.selection ? buildButtons(transaction.state) : value,
  provide: (field) => EditorView.decorations.from(field),
})

export const diagramDone: MarkdownExtension = {
  name: 'relay-diagram-done',
  version: '1.0.0',
  extensions: [buttons],
}
