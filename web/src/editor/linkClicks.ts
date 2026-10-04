import { syntaxTree } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'
import { normalizeLink } from './link'

function linkUrlAt(view: EditorView, pos: number): string | null {
  for (const side of [1, -1] as const) {
    for (
      let node = syntaxTree(view.state).resolveInner(pos, side);
      node.parent;
      node = node.parent
    ) {
      if (node.name !== 'Link') continue
      const url = node.getChild('URL')
      return url ? view.state.sliceDoc(url.from, url.to) : null
    }
  }
  return null
}

export function linkClicks(navigate: (path: string) => void): MarkdownExtension {
  const handler = EditorView.domEventHandlers({
    click(event, view) {
      if (event.button !== 0 || event.shiftKey || event.altKey) return false
      if (!view.state.selection.main.empty) return false
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return false
      const raw = linkUrlAt(view, pos)
      const href = raw ? normalizeLink(raw) : null
      if (!href) return false
      event.preventDefault()
      if (href.startsWith('/') || href.startsWith('#')) navigate(href)
      else window.open(href, '_blank', 'noopener,noreferrer')
      return true
    },
  })
  return { name: 'relay-link-clicks', version: '1.0.0', extensions: [handler] }
}
