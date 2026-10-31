import { type EditorView, ViewPlugin } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'

function wrapOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  if (target.closest('[data-cell-from][contenteditable]')) return null
  return target.closest<HTMLElement>('[data-tablev2-from]')
}

export function keepInsertersWhileInside(target: EventTarget | null): void {
  const wrap = wrapOf(target)
  if (!wrap) return
  for (const button of wrap.querySelectorAll<HTMLElement>(':scope > .cm-table-inserter')) {
    if (button.style.display === 'none' && button.dataset.pos) button.style.display = 'flex'
  }
}

export const tableInserters: MarkdownExtension = {
  name: 'relay-table-inserters',
  version: '1.0.0',
  extensions: [
    ViewPlugin.define((view: EditorView) => {
      const onMouseMove = (event: MouseEvent) =>
        queueMicrotask(() => keepInsertersWhileInside(event.target))
      view.dom.addEventListener('mousemove', onMouseMove)
      return {
        destroy() {
          view.dom.removeEventListener('mousemove', onMouseMove)
        },
      }
    }),
  ],
}
