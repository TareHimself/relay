import { css, cx } from '@linaria/core'
import { useEffect, useRef, type ReactNode } from 'react'

const SCROLL_PX_PER_SECOND = 45
const HOST = 'a, button, [role="menuitem"], [data-marquee-host]'

const outer = css`
  display: block;
  min-width: 0;
  overflow: hidden;
`
const inner = css`
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition-property: transform;
  transition-timing-function: linear;
`

export function MarqueeText({ children, className }: { children: ReactNode; className?: string }) {
  const outerRef = useRef<HTMLSpanElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const box = outerRef.current
    const text = innerRef.current
    const host = box?.closest(HOST)
    if (!box || !text || !host) return
    const start = () => {
      const overflow = text.scrollWidth - text.clientWidth
      if (overflow <= 0) return
      text.style.overflow = 'visible'
      text.style.textOverflow = 'clip'
      text.style.transitionDuration = `${overflow / SCROLL_PX_PER_SECOND}s`
      text.style.transform = `translateX(-${overflow}px)`
    }
    const stop = () => {
      text.style.overflow = ''
      text.style.textOverflow = ''
      text.style.transitionDuration = '0.2s'
      text.style.transform = ''
    }
    host.addEventListener('mouseenter', start)
    host.addEventListener('mouseleave', stop)
    return () => {
      host.removeEventListener('mouseenter', start)
      host.removeEventListener('mouseleave', stop)
    }
  }, [])

  return (
    <span ref={outerRef} className={cx(outer, className)}>
      <span ref={innerRef} className={inner}>
        {children}
      </span>
    </span>
  )
}
