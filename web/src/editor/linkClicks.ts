import { syntaxTree } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'
import { normalizeLink } from './link'

const DOC_PATH = /^\/doc\/[\w-]+\/?$/

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

function internalPath(href: string): string | null {
  if (href.startsWith('/') || href.startsWith('#')) return href
  try {
    const url = new URL(href)
    if (url.origin === window.location.origin || DOC_PATH.test(url.pathname)) {
      return `${url.pathname}${url.search}${url.hash}`
    }
  } catch {
    return null
  }
  return null
}

function hrefAt(view: EditorView, event: MouseEvent): string | null {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  const raw = pos === null ? null : linkUrlAt(view, pos)
  return raw ? normalizeLink(raw) : null
}

export function linkClicks(navigate: (path: string) => void): MarkdownExtension {
  let pressed: string | null = null
  const handler = EditorView.domEventHandlers({
    mousedown(event, view) {
      pressed = event.button === 0 ? hrefAt(view, event) : null
      return false
    },
    click(event, view) {
      const href = pressed
      pressed = null
      if (!href || event.button !== 0 || event.shiftKey || event.altKey) return false
      if (!view.state.selection.main.empty) return false
      event.preventDefault()
      const path = internalPath(href)
      if (path) navigate(path)
      else window.open(href, '_blank', 'noopener,noreferrer')
      return true
    },
  })
  return { name: 'relay-link-clicks', version: '1.0.0', extensions: [handler] }
}
