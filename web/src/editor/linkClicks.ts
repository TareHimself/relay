import { syntaxTree } from '@codemirror/language'
import { EditorView, ViewPlugin } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'
import { linkAt, normalizeLink } from './link'

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>

const DOC_PATH = /^\/doc\/[\w-]+\/?$/

function referenceUrl(view: EditorView, label: string): string | null {
  const wanted = label
    .replace(/^\[|\]$/g, '')
    .trim()
    .toLowerCase()
  let found: string | null = null
  syntaxTree(view.state).iterate({
    enter(node) {
      if (found !== null || node.name !== 'LinkReference') return
      const name = node.node.getChild('LinkLabel')
      const url = node.node.getChild('URL')
      if (!name || !url) return false
      const text = view.state.sliceDoc(name.from, name.to).replace(/^\[|\]$/g, '')
      if (text.trim().toLowerCase() === wanted) found = view.state.sliceDoc(url.from, url.to)
      return false
    },
  })
  return found
}

export function linkUrlAt(view: EditorView, pos: number): string | null {
  for (const side of [1, -1] as const) {
    for (
      let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, side);
      node;
      node = node.parent
    ) {
      if (node.name === 'URL') return view.state.sliceDoc(node.from, node.to)
      if (node.name === 'Autolink') {
        const url = node.getChild('URL')
        return url ? view.state.sliceDoc(url.from, url.to) : null
      }
      if (node.name !== 'Link') continue
      const url = node.getChild('URL')
      if (url) return view.state.sliceDoc(url.from, url.to)
      const labels = node.getChildren('LinkLabel')
      const label = labels.at(-1)
      return label ? referenceUrl(view, view.state.sliceDoc(label.from, label.to)) : null
    }
  }
  return null
}

export function internalPath(href: string): string | null {
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

function trailingLinkLineEnd(view: EditorView, event: MouseEvent): number | null {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
  const line = view.state.doc.lineAt(pos)
  if (view.state.sliceDoc(line.to).trim() !== '') return null
  const inline = linkAt(line.text, pos - line.from, pos - line.from)
  if (inline) return inline.to === line.text.trimEnd().length ? line.to : null
  const url = linkUrlAt(view, pos)
  return url && line.text.trimEnd().replace(/>$/, '').endsWith(url) ? line.to : null
}

export function openHref(href: string, navigate: (path: string) => void) {
  const path = internalPath(href)
  if (path) navigate(path)
  else window.open(href, '_blank', 'noopener,noreferrer')
}

function hrefAt(view: EditorView, event: MouseEvent): string | null {
  const target = event.target
  const element = target instanceof HTMLElement ? target.closest('.cm-link') : null
  if (!element) return null
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  const raw =
    (pos === null ? null : linkUrlAt(view, pos)) ?? linkUrlAt(view, view.posAtDOM(element) + 1)
  return raw ? normalizeLink(raw) : null
}

export function linkClicks(navigate: (path: string) => void): MarkdownExtension {
  let pressed: string | null = null
  const handler = EditorView.domEventHandlers({
    mousedown(event, view) {
      pressed = event.button === 0 ? hrefAt(view, event) : null
      const lineEnd = event.button === 0 && !pressed ? trailingLinkLineEnd(view, event) : null
      if (lineEnd === null) return false
      event.preventDefault()
      view.dispatch({
        changes: { from: lineEnd, to: view.state.doc.length, insert: '\n\n' },
        selection: { anchor: lineEnd + 2 },
        userEvent: 'input',
      })
      view.focus()
      return true
    },
    click(event, view) {
      const href = pressed
      pressed = null
      if (!href || event.button !== 0 || event.shiftKey || event.altKey) return false
      if (!view.state.selection.main.empty) return false
      event.preventDefault()
      openHref(href, navigate)
      return true
    },
  })
  const tableLinks = ViewPlugin.define((view) => {
    const linkIn = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || event.button !== 0) return null
      const anchor = target.closest('a.cm-link')
      return anchor && anchor.closest('[data-cell-from]') ? anchor : null
    }
    const onMouseDown = (event: MouseEvent) => {
      if (linkIn(event)) event.stopPropagation()
    }
    const onClick = (event: MouseEvent) => {
      const anchor = linkIn(event)
      const href = anchor ? normalizeLink(anchor.getAttribute('href') ?? '') : null
      if (!href) return
      event.preventDefault()
      event.stopPropagation()
      openHref(href, navigate)
    }
    view.dom.addEventListener('mousedown', onMouseDown, true)
    view.dom.addEventListener('click', onClick, true)
    return {
      destroy() {
        view.dom.removeEventListener('mousedown', onMouseDown, true)
        view.dom.removeEventListener('click', onClick, true)
      },
    }
  })
  return { name: 'relay-link-clicks', version: '1.0.0', extensions: [handler, tableLinks] }
}
