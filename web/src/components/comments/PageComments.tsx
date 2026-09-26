import { styled } from '@linaria/react'
import { Stack, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import { PromptButton } from './PromptButton'

const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
`

interface PageCommentItem {
  id: string
  node: ReactNode
}

interface PageCommentsProps {
  draft: ReactNode
  cards: PageCommentItem[]
  onStart: () => void
}

export function PageComments({ draft, cards, onStart }: PageCommentsProps) {
  return (
    <Stack component="section" aria-label="Page comments" gap="sm">
      {(cards.length > 0 || draft) && <Title order={5}>Page comments</Title>}
      {cards.length > 0 && (
        <List>
          {cards.map((card) => (
            <li key={card.id}>{card.node}</li>
          ))}
        </List>
      )}
      {draft ?? <PromptButton onClick={onStart}>Add a page comment…</PromptButton>}
    </Stack>
  )
}
