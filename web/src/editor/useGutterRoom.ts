import { useEffect, useState, type RefObject } from 'react'

export function useGutterRoom(frame: RefObject<HTMLElement | null>, needed: number): boolean {
  const [room, setRoom] = useState(false)

  useEffect(() => {
    const element = frame.current
    const main = element?.closest('main')
    if (!element || !main) return
    const measure = () => {
      const padding = parseFloat(getComputedStyle(main).paddingLeft) || 0
      const available =
        element.getBoundingClientRect().left - main.getBoundingClientRect().left - padding
      setRoom(available >= needed)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(main)
    observer.observe(element)
    return () => observer.disconnect()
  }, [frame, needed])

  return room
}
