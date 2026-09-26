import { RangeSetBuilder, StateField, type EditorState } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'
import { codeOf, fencedBlocks } from './fences'

const RESET_MS = 1500
const ICON_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
const COPY_ICON = `<svg ${ICON_ATTRS}><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>`
const CHECK_ICON = `<svg ${ICON_ATTRS}><path d="M5 12l5 5l10 -10" /></svg>`

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

class CopyWidget extends WidgetType {
  constructor(private readonly code: string) {
    super()
  }

  eq(other: CopyWidget): boolean {
    return other.code === this.code
  }

  toDOM(): HTMLElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'relay-copy'
    button.innerHTML = COPY_ICON
    button.setAttribute('aria-label', 'Copy code')
    button.title = 'Copy code'
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      void copyText(this.code).then(() => {
        button.innerHTML = CHECK_ICON
        button.dataset.state = 'copied'
        button.setAttribute('aria-label', 'Copied')
        setTimeout(() => {
          button.innerHTML = COPY_ICON
          delete button.dataset.state
          button.setAttribute('aria-label', 'Copy code')
        }, RESET_MS)
      })
    })
    return button
  }

  ignoreEvent(): boolean {
    return true
  }
}

function buildButtons(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const fence of fencedBlocks(state)) {
    const widget = new CopyWidget(codeOf(state, fence))
    builder.add(fence.opening.to, fence.opening.to, Decoration.widget({ widget, side: 1 }))
  }
  return builder.finish()
}

const buttons = StateField.define<DecorationSet>({
  create: buildButtons,
  update: (value, transaction) =>
    transaction.docChanged ? buildButtons(transaction.state) : value,
  provide: (field) => EditorView.decorations.from(field),
})

export const codeBlockCopy: MarkdownExtension = {
  name: 'code-block-copy',
  version: '1.0.0',
  extensions: [buttons],
}
