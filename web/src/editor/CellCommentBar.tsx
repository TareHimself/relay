import type { EditorView } from '@codemirror/view'
import { css } from '@linaria/core'
import { Button, Paper } from '@mantine/core'
import { IconMessagePlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { CommentDraft } from '../stores/uiStore'
import { cellSelection, type CellSelection } from './cellSelectionDraft'

const BAR_HEIGHT = 44

const bar = css`
  position: fixed;
  z-index: 200;
  padding: 4px;
`

interface CellCommentBarProps {
  view: EditorView | null
  onComment: (draft: CommentDraft) => void
}

export function CellCommentBar({ view, onComment }: CellCommentBarProps) {
  const [selection, setSelection] = useState<CellSelection | null>(null)

  useEffect(() => {
    if (!view) return
    const refresh = () => setSelection(cellSelection(view))
    document.addEventListener('selectionchange', refresh)
    window.addEventListener('scroll', refresh, true)
    return () => {
      document.removeEventListener('selectionchange', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [view])

  if (!selection) return null
  const { rect, draft } = selection
  const top = rect.top > BAR_HEIGHT + 8 ? rect.top - BAR_HEIGHT : rect.bottom + 8
  const left = Math.min(Math.max(rect.left, 8), window.innerWidth - 140)

  return (
    <Paper
      withBorder
      shadow="md"
      radius="md"
      className={bar}
      style={{ top, left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <Button
        size="compact-sm"
        variant="light"
        leftSection={<IconMessagePlus size={16} />}
        onClick={() => onComment(draft)}
      >
        Comment
      </Button>
    </Paper>
  )
}
