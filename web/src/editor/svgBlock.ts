import { syntaxTree } from '@codemirror/language'
import { StateField, type EditorState } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'

interface SvgFence {
  from: number
  to: number
  source: string
}

class SvgWidget extends WidgetType {
  constructor(private readonly source: string) {
    super()
  }

  eq(other: SvgWidget): boolean {
    return other.source === this.source
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div')
    container.className = 'relay-svg-block'
    container.title = 'Click to edit'
    const image = document.createElement('img')
    image.alt = 'SVG'
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.source)}`
    image.addEventListener('error', () => {
      container.textContent = 'Invalid SVG. Click to edit the source.'
      container.dataset.error = 'true'
    })
    container.append(image)
    container.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const fenceStart = view.posAtDOM(container)
      const opener = view.state.doc.lineAt(fenceStart)
      view.dispatch({ selection: { anchor: Math.min(opener.to + 1, view.state.doc.length) } })
      view.focus()
    })
    return container
  }

  ignoreEvent(): boolean {
    return true
  }

  get estimatedHeight(): number {
    return 160
  }
}

function findFences(state: EditorState): SvgFence[] {
  const fences: SvgFence[] = []
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return
      const info = node.node.getChild('CodeInfo')
      if (!info || state.sliceDoc(info.from, info.to).trim().toLowerCase() !== 'svg') return false
      if (node.node.getChildren('CodeMark').length < 2) return false
      const text = node.node.getChild('CodeText')
      fences.push({
        from: node.from,
        to: node.to,
        source: text ? state.sliceDoc(text.from, text.to) : '',
      })
      return false
    },
  })
  return fences
}

function build(state: EditorState, fences: SvgFence[]): DecorationSet {
  const ranges = fences
    .filter((fence) =>
      state.selection.ranges.every(
        (range) =>
          !(range.anchor > fence.from && range.anchor < fence.to) &&
          !(range.head > fence.from && range.head < fence.to),
      ),
    )
    .map((fence) =>
      Decoration.replace({ widget: new SvgWidget(fence.source), block: true }).range(
        fence.from,
        fence.to,
      ),
    )
  return Decoration.set(ranges, true)
}

interface SvgState {
  fences: SvgFence[]
  decorations: DecorationSet
}

const svgField = StateField.define<SvgState>({
  create(state) {
    const fences = findFences(state)
    return { fences, decorations: build(state, fences) }
  },
  update(value, transaction) {
    if (
      transaction.docChanged ||
      syntaxTree(transaction.state) !== syntaxTree(transaction.startState)
    ) {
      const fences = findFences(transaction.state)
      return { fences, decorations: build(transaction.state, fences) }
    }
    if (transaction.selection) {
      return { fences: value.fences, decorations: build(transaction.state, value.fences) }
    }
    return value
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of(
      (view) => view.state.field(field, false)?.decorations ?? Decoration.none,
    ),
  ],
})

export const svgBlock: MarkdownExtension = {
  name: 'relay-svg-block',
  version: '1.0.0',
  extensions: [svgField],
}
