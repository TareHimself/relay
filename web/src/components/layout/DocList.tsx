import { css } from '@linaria/core'
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  NavLink,
  Pill,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core'
import { IconFileText, IconHome, IconPlus, IconTag } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { PageSummary } from '@shared/pages'
import { hasTag } from '@shared/tags'
import { docPath, projectPath } from '../../lib/paths'
import { Eyebrow } from '../common/Eyebrow'
import { NewDocDialog } from './NewDocDialog'

const docLink = css`
  border-radius: var(--mantine-radius-md);
`

function hasAnyTag(pages: readonly PageSummary[], tag: string): boolean {
  return pages.some((page) => hasTag(page.tags, tag))
}

interface DocListProps {
  projectId: string
  pages: PageSummary[]
  loading: boolean
  activeDocId: string | undefined
  homeActive: boolean
}

export function DocList({ projectId, pages, loading, activeDocId, homeActive }: DocListProps) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const page of pages)
      for (const tag of page.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts].sort(([a], [b]) => a.localeCompare(b))
  }, [pages])
  const activeFilter = tagFilter !== null && hasAnyTag(pages, tagFilter) ? tagFilter : null
  const shown =
    activeFilter === null
      ? pages
      : pages.filter((page) => page.id === activeDocId || hasTag(page.tags, activeFilter))

  return (
    <>
      <Group justify="space-between" px="xs" mt="xs">
        <Eyebrow>Docs</Eyebrow>
        <Group gap={2}>
          {tagCounts.length > 0 && (
            <Menu position="bottom-end" width={220} shadow="md">
              <Menu.Target>
                <ActionIcon
                  variant={activeFilter === null ? 'subtle' : 'light'}
                  color="gray"
                  size="sm"
                  aria-label="Filter by tag"
                >
                  <IconTag size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown mah={320} style={{ overflowY: 'auto' }}>
                {tagCounts.map(([tag, count]) => (
                  <Menu.Item
                    key={tag}
                    rightSection={
                      <Text size="xs" c="dimmed">
                        {count}
                      </Text>
                    }
                    onClick={() => setTagFilter(tag)}
                  >
                    {tag}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="New doc"
            onClick={() => setCreating(true)}
          >
            <IconPlus size={16} />
          </ActionIcon>
        </Group>
      </Group>
      {activeFilter !== null && (
        <Group px="xs" gap={6}>
          <Pill
            withRemoveButton
            onRemove={() => setTagFilter(null)}
            removeButtonProps={{ 'aria-label': 'Clear tag filter' }}
          >
            {activeFilter}
          </Pill>
        </Group>
      )}
      <ScrollArea flex="0 1 auto">
        <Stack gap={2}>
          <NavLink
            label="Home"
            leftSection={<IconHome size={16} />}
            active={homeActive}
            variant="light"
            className={docLink}
            onClick={() => void navigate(projectPath(projectId))}
          />
          {loading && <Skeleton height={34} radius="md" />}
          {shown.map((page) => (
            <NavLink
              key={page.id}
              label={page.title}
              leftSection={<IconFileText size={16} />}
              active={page.id === activeDocId}
              variant="light"
              className={docLink}
              onClick={() => void navigate(docPath(projectId, page.id))}
            />
          ))}
          <Button
            variant="subtle"
            color="gray"
            justify="flex-start"
            size="compact-sm"
            mt={4}
            leftSection={<IconPlus size={14} />}
            onClick={() => setCreating(true)}
          >
            New doc
          </Button>
        </Stack>
      </ScrollArea>
      <NewDocDialog projectId={projectId} opened={creating} onClose={() => setCreating(false)} />
    </>
  )
}
