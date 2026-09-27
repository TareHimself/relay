import {
  ActionIcon,
  Button,
  Group,
  Menu,
  SegmentedControl,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  IconArrowsHorizontal,
  IconDots,
  IconHistory,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react'
import type { SaveStatus } from '../../editor/useDocSync'
import type { PageWidth } from '../../stores/prefsStore'
import type { ThreadFilter } from '../../stores/uiStore'
import { Eyebrow } from '../common/Eyebrow'

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Save failed',
  conflict: 'Changed elsewhere',
}

interface DocTitleProps {
  projectName: string | undefined
  title: string
}

export function DocTitle({ projectName, title }: DocTitleProps) {
  return (
    <div style={{ paddingInlineStart: 6 }}>
      <Eyebrow>{projectName}</Eyebrow>
      <Title order={1} style={{ fontSize: 40, letterSpacing: '-0.02em' }}>
        {title}
      </Title>
    </div>
  )
}

interface DocActionsProps {
  status: SaveStatus
  resolvedCount: number
  filter: ThreadFilter
  onFilterChange: (filter: ThreadFilter) => void
  onRetry: () => void
  pageWidth: PageWidth
  onToggleWidth: () => void
  onOpenVersions: () => void
  onRename: () => void
  onDelete: () => void
}

export function DocActions(props: DocActionsProps) {
  const failed = props.status === 'error'
  return (
    <Group justify="flex-end" gap="md">
      <Text size="xs" c={failed || props.status === 'conflict' ? 'red' : 'dimmed'}>
        {STATUS_TEXT[props.status]}
        {failed && (
          <Button size="compact-xs" variant="subtle" ml={4} onClick={props.onRetry}>
            Retry
          </Button>
        )}
      </Text>
      {(props.resolvedCount > 0 || props.filter === 'resolved') && (
        <SegmentedControl
          size="xs"
          value={props.filter}
          onChange={(value) => props.onFilterChange(value as ThreadFilter)}
          data={[
            { label: 'Open', value: 'open' },
            { label: `Resolved (${props.resolvedCount})`, value: 'resolved' },
          ]}
        />
      )}
      <Tooltip label="Version history" openDelay={300}>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Version history"
          onClick={props.onOpenVersions}
        >
          <IconHistory size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={props.pageWidth === 'full' ? 'Standard width' : 'Full width'} openDelay={300}>
        <ActionIcon
          variant={props.pageWidth === 'full' ? 'light' : 'subtle'}
          color="gray"
          aria-label="Toggle full width"
          onClick={props.onToggleWidth}
        >
          <IconArrowsHorizontal size={16} />
        </ActionIcon>
      </Tooltip>
      <Menu position="bottom-end" width={200} shadow="md">
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label="More actions">
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPencil size={14} />} onClick={props.onRename}>
            Rename doc
          </Menu.Item>
          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={props.onDelete}>
            Delete doc
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
