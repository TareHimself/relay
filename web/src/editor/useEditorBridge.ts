import type { EditorView } from '@codemirror/view'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { EditorBridge } from './commentsExtension'

export function useEditorBridge(onActivate: (threadId: string) => void) {
  const [view, setView] = useState<EditorView | null>(null)
  const [tick, bump] = useReducer((count: number) => count + 1, 0)
  const frame = useRef(0)
  const activate = useRef(onActivate)
  useEffect(() => {
    activate.current = onActivate
  })

  const bridge = useMemo<EditorBridge>(
    () => ({
      activate: (threadId) => activate.current(threadId),
      attach: setView,
      detach: () => setView(null),
      changed: () => {
        if (frame.current) return
        frame.current = requestAnimationFrame(() => {
          frame.current = 0
          bump()
        })
      },
    }),
    [],
  )

  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  return { bridge, view, tick }
}
