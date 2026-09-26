import { css } from '@linaria/core'
import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { IconArrowBackUp, IconCheck } from '@tabler/icons-react'
import { useState } from 'react'
import type { Thread } from '@shared/threads'
import { useCurrentActor } from '../../api/identity'
import { CommentForm } from './CommentForm'
import { MessageItem } from './MessageItem'
import { PromptButton } from './PromptButton'
import { QuoteBlock } from './QuoteBlock'

const card = css`
  cursor: pointer;
`
const cardActive = css`
  border-color: var(--mantine-color-green-5);
`
interface ThreadCardProps {
  thread: Thread
  active: boolean
  onActivate: () => void
  onHover: (hovering: boolean) => void
  onReply: (body: string) => Promise<void>
  onEdit: (messageId: string, body: string) => Promise<void>
  onDelete: (messageId: string) => void
  onResolve: () => void
  onReopen: () => void
}

export function ThreadCard({
  thread,
  active,
  onActivate,
  onHover,
  onReply,
  onEdit,
  onDelete,
  onResolve,
  onReopen,
}: ThreadCardProps) {
  const [replying, setReplying] = useState(false)
  const currentActor = useCurrentActor()
  const resolved = thread.status === 'resolved'
  const hasChips = thread.to.length > 0 || thread.status !== 'open'

  const toggle = (
    <Tooltip label={resolved ? 'Reopen' : 'Resolve'} openDelay={300}>
      <ActionIcon
        size="sm"
        variant="subtle"
        color={resolved ? 'gray' : 'green'}
        aria-label={resolved ? 'Reopen thread' : 'Resolve thread'}
        onClick={(event) => {
          event.stopPropagation()
          if (resolved) onReopen()
          else onResolve()
        }}
      >
        {resolved ? <IconArrowBackUp size={16} /> : <IconCheck size={16} />}
      </ActionIcon>
    </Tooltip>
  )

  return (
    <Paper
      component="article"
      withBorder
      radius="md"
      p="xs"
      shadow={active ? 'md' : 'xs'}
      className={active ? `${card} ${cardActive}` : card}
      onClick={onActivate}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <Stack gap="xs">
        {hasChips && (
          <Group gap={6}>
            {thread.to.length > 0 && (
              <Text size="xs" c="dimmed">
                to {thread.to.map((handle) => `@${handle}`).join(' ')}
              </Text>
            )}
            {thread.status === 'answered' && (
              <Badge size="xs" variant="dot" color="green">
                Answered
              </Badge>
            )}
            {resolved && (
              <Badge size="xs" variant="light" color="gray">
                Resolved
              </Badge>
            )}
          </Group>
        )}
        {thread.anchor && <QuoteBlock>{thread.anchor.exact}</QuoteBlock>}
        {thread.messages.map((message, index) => (
          <MessageItem
            key={message.id}
            extraAction={index === 0 ? toggle : undefined}
            message={message}
            canModify={message.author === currentActor}
            onEdit={(body) => onEdit(message.id, body)}
            onDelete={() => onDelete(message.id)}
          />
        ))}
        {!resolved &&
          (replying ? (
            <CommentForm
              autoFocus
              placeholder="Reply… @name to mention a person or agent"
              submitLabel="Reply"
              onSubmit={async (body) => {
                await onReply(body)
                setReplying(false)
              }}
              onCancel={() => setReplying(false)}
            />
          ) : (
            <PromptButton
              onClick={(event) => {
                event.stopPropagation()
                onActivate()
                setReplying(true)
              }}
            >
              Reply…
            </PromptButton>
          ))}
      </Stack>
    </Paper>
  )
}
