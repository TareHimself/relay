import { css } from '@linaria/core'
import { Badge, Group, Paper, Stack, Text } from '@mantine/core'
import { IconFileText, IconPlus } from '@tabler/icons-react'
import { Link } from 'react-router'
import type { PageSummary } from '@shared/pages'
import { docPath } from '../../lib/paths'
import { timeAgo } from '../../lib/timeAgo'

const card = css`
  display: block;
  height: 100%;
  min-height: 150px;
  color: inherit;
  text-decoration: none;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;

  &:hover {
    border-color: var(--mantine-color-gray-5);
    box-shadow: var(--mantine-shadow-sm);
  }
`
const newCard = css`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 150px;
  border: 1px dashed var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-md);
  background: none;
  color: var(--mantine-color-dimmed);
  cursor: pointer;

  &:hover {
    border-color: var(--mantine-color-gray-5);
    color: var(--mantine-color-text);
  }
`

interface DocCardProps {
  projectId: string
  page: PageSummary
}

export function DocCard({ projectId, page }: DocCardProps) {
  return (
    <Paper
      component={Link}
      to={docPath(projectId, page.id)}
      withBorder
      radius="md"
      p="md"
      className={card}
    >
      <Stack gap={8} h="100%">
        <Group gap={6} wrap="nowrap">
          <IconFileText size={16} opacity={0.6} />
          <Text fw={600} lineClamp={1}>
            {page.title}
          </Text>
        </Group>
        <Text size="sm" c="dimmed" lineClamp={4} fs={page.excerpt ? undefined : 'italic'} flex={1}>
          {page.excerpt || 'Empty doc'}
        </Text>
        {page.tags.length > 0 && (
          <Group gap={4}>
            {page.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="light" color="gray" radius="sm" tt="none" fw={500}>
                {tag}
              </Badge>
            ))}
            {page.tags.length > 4 && (
              <Text size="xs" c="dimmed">
                +{page.tags.length - 4}
              </Text>
            )}
          </Group>
        )}
        {page.updatedAt && (
          <Text size="xs" c="dimmed">
            Edited {timeAgo(page.updatedAt)}
          </Text>
        )}
      </Stack>
    </Paper>
  )
}

export function NewDocCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={newCard} onClick={onClick}>
      <Group gap={6}>
        <IconPlus size={18} />
        <Text size="sm">New doc</Text>
      </Group>
    </button>
  )
}
