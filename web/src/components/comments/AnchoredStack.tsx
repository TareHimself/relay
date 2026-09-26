import { styled } from '@linaria/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const GAP = 10

export interface AnchoredItem {
  id: string
  top: number
  children: ReactNode
}

const Rail = styled.aside`
  min-width: 0;
`
const FlowList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${GAP}px;
  margin: 0;
  padding: 0;
  list-style: none;
`
const TrackList = styled.ul`
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
`
const Slot = styled.li`
  position: absolute;
  left: 0;
  right: 0;
  transition: top 120ms ease;
  animation: relay-fade-in 160ms ease;
`

function sameLayout(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(b)
  return Object.keys(a).length === keys.length && keys.every((key) => a[key] === b[key])
}

interface AnchoredStackProps {
  items: AnchoredItem[]
  wide: boolean
}

export function AnchoredStack({ items, wide }: AnchoredStackProps) {
  const elements = useRef(new Map<string, HTMLElement>())
  const [tops, setTops] = useState<Record<string, number>>({})
  const [height, setHeight] = useState(0)
  const [known, setKnown] = useState<ReadonlySet<string>>(() => new Set())

  const layout = useCallback((current: AnchoredItem[]) => {
    const next: Record<string, number> = {}
    let cursor = 0
    for (const item of [...current].sort((a, b) => a.top - b.top)) {
      const top = Math.max(item.top, cursor)
      next[item.id] = top
      cursor = top + (elements.current.get(item.id)?.offsetHeight ?? 0) + GAP
    }
    setTops((previous) => (sameLayout(previous, next) ? previous : next))
    setHeight(cursor)
  }, [])

  useEffect(() => {
    setKnown((current) =>
      current.size === items.length && items.every((item) => current.has(item.id))
        ? current
        : new Set(items.map((item) => item.id)),
    )
  }, [items])

  useLayoutEffect(() => {
    if (!wide) return
    layout(items)
    const observer = new ResizeObserver(() => layout(items))
    for (const element of elements.current.values()) observer.observe(element)
    return () => observer.disconnect()
  })

  return (
    <Rail aria-label="Comments">
      {wide ? (
        <TrackList style={{ height }}>
          {items.map((item) => (
            <Slot
              key={item.id}
              style={{
                top: tops[item.id] ?? item.top,
                ...(known.has(item.id) ? {} : { transition: 'none' }),
              }}
              ref={(element: HTMLLIElement | null) => {
                if (element) elements.current.set(item.id, element)
                else elements.current.delete(item.id)
              }}
            >
              {item.children}
            </Slot>
          ))}
        </TrackList>
      ) : (
        <FlowList>
          {[...items]
            .sort((a, b) => a.top - b.top)
            .map((item) => (
              <li key={item.id}>{item.children}</li>
            ))}
        </FlowList>
      )}
    </Rail>
  )
}
