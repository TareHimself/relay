import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'

type LinkKind = 'doc' | 'github' | 'gdoc'

const DOC_PATH = /^\/doc\/[\w-]+\/?$/
const GOOGLE_DOC_PATH = /^\/(document|spreadsheets|presentation|forms)\//

function kindOf(href: string): LinkKind | null {
  if (href.startsWith('/')) return DOC_PATH.test(href.split(/[?#]/)[0] ?? '') ? 'doc' : null
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (DOC_PATH.test(url.pathname)) return 'doc'
  if (url.hostname === 'github.com' || url.hostname === 'www.github.com') return 'github'
  if (url.hostname === 'docs.google.com' && GOOGLE_DOC_PATH.test(url.pathname)) return 'gdoc'
  return null
}

const marks: Record<LinkKind, Decoration> = {
  doc: Decoration.mark({ class: 'relay-link-kind relay-link-kind--doc' }),
  github: Decoration.mark({ class: 'relay-link-kind relay-link-kind--github' }),
  gdoc: Decoration.mark({ class: 'relay-link-kind relay-link-kind--gdoc' }),
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'Link') return
        const url = node.node.getChild('URL')
        const opening = node.node.getChildren('LinkMark')
        const kind = url ? kindOf(view.state.sliceDoc(url.from, url.to)) : null
        const start = opening[0]?.to
        const end = opening[1]?.from
        if (kind && start !== undefined && end !== undefined && end > start) {
          builder.add(start, end, marks[kind])
        }
        return false
      },
    })
  }
  return builder.finish()
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = build(update.view)
    }
  },
  { decorations: (value) => value.decorations },
)

export const linkKinds: MarkdownExtension = {
  name: 'relay-link-kinds',
  version: '1.0.0',
  extensions: [plugin],
}
