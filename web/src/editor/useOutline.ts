import { EditorView } from '@codemirror/view'
import { useCallback, useEffect, useRef } from 'react'
import { useOutlineStore } from '../stores/outlineStore'
import { activeHeading, outlineOf, type OutlineItem } from './outline'

const ACTIVE_OFFSET = 120
const PIN_MS = 700

function sameItems(a: readonly OutlineItem[], b: readonly OutlineItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, i) => {
      const other = b[i]
      return (
        other !== undefined &&
        item.level === other.level &&
        item.title === other.title &&
        item.from === other.from
      )
    })
  )
}

export function useOutline(view: EditorView | null, tick: number): void {
  const pinnedUntil = useRef(0)
  const jump = useCallback(
    (from: number) => {
      if (!view) return
      const store = useOutlineStore.getState()
      store.setActive(store.items.findIndex((item) => item.from === from))
      pinnedUntil.current = performance.now() + PIN_MS
      view.dispatch({
        selection: { anchor: from },
        effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 24 }),
      })
      view.focus()
    },
    [view],
  )

  useEffect(() => {
    if (!view) return
    const store = useOutlineStore.getState()
    const next = outlineOf(view.state.doc.toString())
    if (store.jump === jump && sameItems(store.items, next)) return
    store.publish(next, jump)
  }, [view, tick, jump])

  useEffect(() => {
    if (!view) return
    let frame = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      frame = 0
      const pinned = pinnedUntil.current - performance.now()
      if (pinned > 0) {
        clearTimeout(timer)
        timer = setTimeout(schedule, pinned + 20)
        return
      }
      const { items, setActive } = useOutlineStore.getState()
      const tops = items.map((item) => view.documentTop + view.lineBlockAt(item.from).top)
      const page = document.scrollingElement
      const atBottom =
        page !== null &&
        page.scrollTop > 0 &&
        page.scrollTop + page.clientHeight >= page.scrollHeight - 2
      setActive(activeHeading(tops, ACTIVE_OFFSET, atBottom))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [view, tick])

  useEffect(() => () => useOutlineStore.getState().clear(), [])
}
