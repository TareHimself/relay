import { ActionIcon, Group, Menu, Stack, Text, Tooltip } from '@mantine/core'
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import type { Message } from '@shared/threads'
import { useDisplayName } from '../../api/identity'
import { timeAgo } from '../../lib/timeAgo'
import { CommentForm } from './CommentForm'
import { MentionText } from './MentionText'

interface MessageItemProps {
  message: Message
  canModify: boolean
  onEdit: (body: string) => Promise<void>
  onDelete: () => void
  extraAction?: ReactNode
}

export function MessageItem({
  message,
  canModify,
  onEdit,
  onDelete,
  extraAction,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false)
  const displayName = useDisplayName()

  return (
    <Stack gap={2} miw={0}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap={6} align="baseline" wrap="nowrap">
          <Text size="xs" fw={600}>
            {displayName(message.author)}
          </Text>
          <Tooltip label={new Date(message.at).toLocaleString()} openDelay={300}>
            <Text size="xs" c="dimmed">
              {timeAgo(message.at)}
            </Text>
          </Tooltip>
          {message.editedAt && (
            <Text size="xs" c="dimmed">
              (edited)
            </Text>
          )}
        </Group>
        <Group gap={2} wrap="nowrap">
          {extraAction}
          {canModify && !editing && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  aria-label="Comment actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <IconDots size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(true)}>
                  Edit comment
                </Menu.Item>
                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onDelete}>
                  Delete comment
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>
      {editing ? (
        <CommentForm
          autoFocus
          placeholder="Edit comment"
          submitLabel="Save"
          initialValue={message.body}
          onSubmit={async (body) => {
            await onEdit(body)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <MentionText text={message.body} />
      )}
    </Stack>
  )
}
