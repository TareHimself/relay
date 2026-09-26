import { StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'
import { insideCode } from './headingShortcut'

const EMPTY_HEADING = /^(#{1,6})[ \t]?$/

export function placeholderFor(lineText: string): string | null {
  const hashes = EMPTY_HEADING.exec(lineText)?.[1]
  return hashes ? `Heading ${hashes.length}` : null
}

class PlaceholderWidget extends WidgetType {
  constructor(private readonly text: string) {
    super()
  }

  eq(other: PlaceholderWidget): boolean {
    return other.text === this.text
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'relay-heading-placeholder'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = this.text
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

function build(state: EditorState) {
  const { main } = state.selection
  if (!main.empty) return Decoration.none
  const line = state.doc.lineAt(main.head)
  if (main.head !== line.to) return Decoration.none
  const text = placeholderFor(line.text)
  if (!text || insideCode(state, line.from)) return Decoration.none
  return Decoration.set([
    Decoration.widget({ widget: new PlaceholderWidget(text), side: 1 }).range(line.to),
  ])
}

const field = StateField.define({
  create: build,
  update: (value, transaction) =>
    transaction.docChanged || transaction.selection ? build(transaction.state) : value,
  provide: (f) => EditorView.decorations.from(f),
})

export const headingPlaceholder: MarkdownExtension = {
  name: 'heading-placeholder',
  version: '1.0.0',
  extensions: [field],
}
