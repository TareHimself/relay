import { type EditorView, ViewPlugin } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'

const ZOOM_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M7 10l6 0" /><path d="M10 7l0 6" /><path d="M21 21l-6 -6" /></svg>'

function addZoomButtons(root: HTMLElement, onZoom: (svg: string) => void) {
  for (const block of root.querySelectorAll<HTMLElement>('.cm-mermaid-block')) {
    const svg = block.querySelector(':scope > svg')
    if (!svg || block.querySelector(':scope > .relay-zoom')) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'relay-zoom'
    button.innerHTML = ZOOM_ICON
    button.title = 'Zoom diagram'
    button.setAttribute('aria-label', 'Zoom diagram')
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      onZoom(svg.outerHTML)
    })
    block.append(button)
  }
}

export function diagramZoom(onZoom: (svg: string) => void): MarkdownExtension {
  const plugin = ViewPlugin.define((view: EditorView) => {
    let scheduled = 0
    const scan = () => {
      scheduled = 0
      addZoomButtons(view.contentDOM, onZoom)
    }
    const observer = new MutationObserver(() => {
      if (!scheduled) scheduled = requestAnimationFrame(scan)
    })
    observer.observe(view.contentDOM, { childList: true, subtree: true })
    scan()
    return {
      destroy() {
        observer.disconnect()
        if (scheduled) cancelAnimationFrame(scheduled)
      },
    }
  })
  return { name: 'relay-diagram-zoom', version: '1.0.0', extensions: [plugin] }
}
