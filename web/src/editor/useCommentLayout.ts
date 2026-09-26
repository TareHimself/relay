import type { EditorView } from '@codemirror/view'
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type RefObject } from 'react'
import { resolveAnchor } from '@shared/anchors'
import type { Thread } from '@shared/threads'
import type { CommentDraft } from '../stores/uiStore'
import { DRAFT_ID, markRanges, setCommentMarks, type CommentMark } from './commentsExtension'

interface Placement {
  thread: Thread
  top: number
}

export interface CommentLayout {
  settled: boolean
  placed: Placement[]
  unplaced: Thread[]
  draftTop: number | null
}

interface MeasuredLayout extends Omit<CommentLayout, 'settled'> {
  key: readonly Thread[]
}

interface LayoutInput {
  view: EditorView | null
  container: RefObject<HTMLElement | null>
  threads: Thread[]
  activeId: string | null
  hoveredId: string | null
  draft: CommentDraft | null
  tick: number
}

const EMPTY: MeasuredLayout = { key: [], placed: [], unplaced: [], draftTop: null }

function signature(layout: MeasuredLayout): string {
  return JSON.stringify([
    layout.placed.map((p) => [p.thread, p.top]),
    layout.unplaced,
    layout.draftTop,
  ])
}

export function useCommentLayout(input: LayoutInput): CommentLayout {
  const { view, container, threads, activeId, hoveredId, draft, tick } = input
  const [measured, setMeasured] = useState(EMPTY)
  const applied = useRef<readonly Thread[] | null>(null)
  const [appliedCount, markApplied] = useReducer((count: number) => count + 1, 0)

  useEffect(() => {
    if (!view) return
    const text = view.state.doc.toString()
    const marks: CommentMark[] = []
    for (const thread of threads) {
      if (!thread.anchor) continue
      const range = resolveAnchor(text, thread.anchor, thread.anchor.offset)
      if (range)
        marks.push({
          id: thread.id,
          ...range,
          active: thread.id === activeId || thread.id === hoveredId,
        })
    }
    if (draft) {
      const range = resolveAnchor(text, draft, draft.from)
      if (range) marks.push({ id: DRAFT_ID, ...range })
    }
    view.dispatch({ effects: setCommentMarks.of(marks) })
    applied.current = threads
    markApplied()
  }, [view, threads, activeId, hoveredId, draft])

  useLayoutEffect(() => {
    const root = container.current
    if (!view || !root || applied.current !== threads) return
    const ranges = markRanges(view.state)
    const base = root.getBoundingClientRect().top
    const topOf = (pos: number) => {
      const coords = view.coordsAtPos(pos)
      return coords ? coords.top - base : view.documentTop + view.lineBlockAt(pos).top - base
    }
    const draftRange = ranges.get(DRAFT_ID)
    const next: MeasuredLayout = {
      key: threads,
      placed: threads.flatMap((thread) => {
        const range = ranges.get(thread.id)
        return range ? [{ thread, top: topOf(range.from) }] : []
      }),
      unplaced: threads.filter((thread) => thread.anchor && !ranges.has(thread.id)),
      draftTop: draftRange ? topOf(draftRange.from) : null,
    }
    setMeasured((current) =>
      current.key === next.key && signature(current) === signature(next) ? current : next,
    )
  }, [view, container, threads, activeId, draft, tick, appliedCount])

  return { ...measured, settled: measured.key === threads }
}
