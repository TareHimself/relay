import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { EditorState, Line } from '@codemirror/state'

const FENCE_LINE = /^(\s*)(`{3,}|~{3,})/

export interface FenceInfo {
  opening: Line
  closing: Line | null
  marker: string
  to: number
}

function parsedTree(state: EditorState) {
  return ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state)
}

function fenceInfo(state: EditorState, node: { from: number; to: number }): FenceInfo | null {
  const doc = state.doc
  const opening = doc.lineAt(node.from)
  const marker = FENCE_LINE.exec(opening.text)?.[2]
  if (!marker) return null
  const last = doc.lineAt(node.to)
  const closesWith = new RegExp(String.raw`^\s*${marker[0]}{${marker.length},}\s*$`)
  const closing = last.number > opening.number && closesWith.test(last.text) ? last : null
  return { opening, closing, marker, to: node.to }
}

export function fencedCodeAt(state: EditorState, pos: number): FenceInfo | null {
  for (let node = parsedTree(state).resolveInner(pos, -1); node.parent; node = node.parent) {
    if (node.name === 'FencedCode') return fenceInfo(state, node)
  }
  return null
}

export function fencedBlocks(state: EditorState): FenceInfo[] {
  const blocks: FenceInfo[] = []
  parsedTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return
      const info = fenceInfo(state, node)
      if (info) blocks.push(info)
      return false
    },
  })
  return blocks
}

export function codeOf(state: EditorState, fence: FenceInfo): string {
  const start = fence.opening.to + 1
  const end = fence.closing ? fence.closing.from - 1 : fence.to
  return start >= end ? '' : state.sliceDoc(start, end)
}
