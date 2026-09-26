import { Paper, Stack } from '@mantine/core'
import { CommentForm } from './CommentForm'
import { QuoteBlock } from './QuoteBlock'

interface DraftCardProps {
  quote: string | undefined
  onSubmit: (body: string) => Promise<void>
  onCancel: () => void
}

export function DraftCard({ quote, onSubmit, onCancel }: DraftCardProps) {
  return (
    <Paper
      component="article"
      withBorder
      radius="md"
      p="sm"
      shadow="md"
      style={{ borderColor: 'var(--mantine-color-green-5)' }}
    >
      <Stack gap="xs">
        {quote && <QuoteBlock>{quote}</QuoteBlock>}
        <CommentForm
          autoFocus
          placeholder="Add a comment… @name to mention a person or agent"
          submitLabel="Comment"
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </Paper>
  )
}
