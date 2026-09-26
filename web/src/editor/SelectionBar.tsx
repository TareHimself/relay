import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { css } from '@linaria/core'
import { formatCommands } from '@latentic/live-markdown'
import { ActionIcon, Button, Divider, Group, Paper, Tooltip } from '@mantine/core'
import {
  IconBold,
  IconCode,
  IconItalic,
  IconLink,
  IconMessagePlus,
  IconStrikethrough,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { CommentDraft } from '../stores/uiStore'
import { draftFromSelection } from './selectionDraft'

const BAR_WIDTH = 300

const bar = css`
  position: fixed;
  z-index: 200;
  padding: 4px;
`

function wrapSelection(view: EditorView, before: string, after: string) {
  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: [
      { from, insert: before },
      { from: to, insert: after },
    ],
    selection: EditorSelection.range(from + before.length, to + before.length),
  })
  view.focus()
}

interface SelectionBarProps {
  view: EditorView
  onComment: (draft: CommentDraft) => void
  onLink: () => void
}

export function SelectionBar({ view, onComment, onLink }: SelectionBarProps) {
  const [, redraw] = useState(0)

  useEffect(() => {
    const refresh = () => redraw((count) => count + 1)
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
    return () => {
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', refresh)
    }
  }, [])

  const main = view.state.selection.main
  const coords = view.coordsAtPos(main.from)
  if (main.empty || !coords) return null
  const top =
    coords.top > 56 ? coords.top - 48 : (view.coordsAtPos(main.to)?.bottom ?? coords.bottom) + 8
  const left = Math.min(Math.max(coords.left, 8), window.innerWidth - BAR_WIDTH - 8)

  const run = (command: (target: EditorView) => unknown) => () => {
    command(view)
    view.focus()
  }
  const item = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Tooltip label={label} openDelay={400}>
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
      className={bar}
      style={{ top, left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <Group gap={2} wrap="nowrap">
        {item('Bold', <IconBold size={16} />, run(formatCommands.toggleBold))}
        {item('Italic', <IconItalic size={16} />, run(formatCommands.toggleItalic))}
        {item('Strikethrough', <IconStrikethrough size={16} />, () =>
          wrapSelection(view, '~~', '~~'),
        )}
        {item('Code', <IconCode size={16} />, run(formatCommands.toggleInlineCode))}
        {item('Link', <IconLink size={16} />, onLink)}
        <Divider orientation="vertical" mx={4} />
        <Button
          size="compact-sm"
          variant="light"
          leftSection={<IconMessagePlus size={16} />}
          onClick={() => {
            const draft = draftFromSelection(view)
            if (draft) onComment(draft)
          }}
        >
          Comment
        </Button>
      </Group>
    </Paper>
  )
}
