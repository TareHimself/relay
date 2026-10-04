import type { EditorView } from '@codemirror/view'
import { css } from '@linaria/core'
import { ActionIcon, Group, Paper, Text, Tooltip } from '@mantine/core'
import { IconCopy, IconExternalLink, IconLinkOff, IconPencil } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../stores/uiStore'
import { linkAt, normalizeLink } from './link'
import { linkUrlAt, openHref } from './linkClicks'

const HIDE_DELAY_MS = 300
const SAFE_PX = 6
const CARD_WIDTH = 300

const card = css`
  position: fixed;
  z-index: 200;
  width: ${CARD_WIDTH}px;
  padding: 4px 4px 4px 12px;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -16px;
    height: 16px;
  }
`

interface HoveredLink {
  from: number
  to: number
  label: string
  url: string
  left: number
  top: number
  editable: boolean
  anchor: { left: number; right: number; top: number; bottom: number }
}

const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g

function tableLink(view: EditorView, cell: Element, element: Element) {
  const start = Number((cell as HTMLElement).dataset.cellFrom)
  const line = view.state.doc.lineAt(start)
  const raw = view.state.sliceDoc(start, line.to)
  const label = element.textContent ?? ''
  const matches = [...raw.matchAll(MARKDOWN_LINK)]
  const match = matches.find((m) => m[1] === label) ?? matches[0]
  if (!match) return null
  return {
    from: start + match.index,
    to: start + match.index + match[0].length,
    label: match[1] ?? '',
    url: match[2] ?? '',
  }
}

interface LinkHoverCardProps {
  view: EditorView | null
  navigate: (path: string) => void
}

export function LinkHoverCard({ view, navigate }: LinkHoverCardProps) {
  const [link, setLink] = useState<HoveredLink | null>(null)
  const hideTimer = useRef<number>(0)
  const hidePending = useRef(false)
  const shown = useRef<HoveredLink | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    shown.current = link
  }, [link])

  useEffect(() => {
    if (!view) return
    const cancelHide = () => {
      window.clearTimeout(hideTimer.current)
      hidePending.current = false
    }
    const scheduleHide = () => {
      if (hidePending.current) return
      hidePending.current = true
      hideTimer.current = window.setTimeout(() => {
        hidePending.current = false
        setLink(null)
      }, HIDE_DELAY_MS)
    }
    const onDocumentMove = (event: MouseEvent) => {
      const open = shown.current
      if (!open) return
      const card = cardRef.current?.getBoundingClientRect()
      const box = {
        left: Math.min(open.anchor.left, card?.left ?? open.anchor.left) - SAFE_PX,
        right: Math.max(open.anchor.right, card?.right ?? open.anchor.right) + SAFE_PX,
        top: Math.min(open.anchor.top, card?.top ?? open.anchor.top) - SAFE_PX,
        bottom: Math.max(open.anchor.bottom, card?.bottom ?? open.anchor.bottom) + SAFE_PX,
      }
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      if (inside) cancelHide()
      else scheduleHide()
    }
    const onMove = (event: MouseEvent) => {
      const element = (event.target as HTMLElement).closest?.('.cm-link')
      if (!element) return
      const cell = element.closest('[data-cell-from]')
      let found: { from: number; to: number; label: string; url: string } | null = null
      let editable = true
      if (cell) {
        found = tableLink(view, cell, element)
      } else {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return
        const line = view.state.doc.lineAt(pos)
        const inline = linkAt(line.text, pos - line.from, pos - line.from)
        if (inline) {
          found = {
            from: line.from + inline.from,
            to: line.from + inline.to,
            label: inline.label,
            url: inline.url,
          }
        } else {
          const url = linkUrlAt(view, pos)
          if (url) found = { from: -1, to: -1, label: '', url }
          editable = false
        }
      }
      if (!found) return
      cancelHide()
      const rect = element.getBoundingClientRect()
      setLink((previous) =>
        previous && previous.url === found.url && previous.from === found.from
          ? previous
          : {
              ...found,
              editable,
              anchor: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
              left: Math.min(rect.left, window.innerWidth - CARD_WIDTH - 8),
              top: rect.bottom + 2,
            },
      )
    }
    const hide = () => setLink(null)
    view.dom.addEventListener('mousemove', onMove)
    document.addEventListener('mousemove', onDocumentMove)
    view.dom.addEventListener('mousedown', hide)
    window.addEventListener('scroll', hide, true)
    return () => {
      cancelHide()
      view.dom.removeEventListener('mousemove', onMove)
      document.removeEventListener('mousemove', onDocumentMove)
      view.dom.removeEventListener('mousedown', hide)
      window.removeEventListener('scroll', hide, true)
    }
  }, [view])

  if (!link || !view) return null
  const href = normalizeLink(link.url)

  function open() {
    if (!href) return
    openHref(href, navigate)
  }

  function edit() {
    if (!link) return
    useUiStore.getState().openLink({ ...link, editing: true })
    setLink(null)
  }

  function unlink() {
    if (!link || !view) return
    view.dispatch({
      changes: { from: link.from, to: link.to, insert: link.label || link.url },
      userEvent: 'input',
    })
    setLink(null)
  }

  const action = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Tooltip label={label} openDelay={300}>
      <ActionIcon variant="subtle" color="gray" aria-label={label} onClick={onClick}>
        {icon}
      </ActionIcon>
    </Tooltip>
  )

  return (
    <Paper
      withBorder
      shadow="md"
      radius="md"
      ref={cardRef}
      className={card}
      style={{ left: link.left, top: link.top }}
    >
      <Group gap={2} wrap="nowrap">
        <Text size="sm" c="dimmed" truncate flex={1}>
          {link.url}
        </Text>
        {action('Open', <IconExternalLink size={16} />, open)}
        {link.editable && action('Edit link', <IconPencil size={16} />, edit)}
        {action(
          'Copy link',
          <IconCopy size={16} />,
          () => void navigator.clipboard.writeText(link.url),
        )}
        {link.editable && action('Remove link', <IconLinkOff size={16} />, unlink)}
      </Group>
    </Paper>
  )
}
