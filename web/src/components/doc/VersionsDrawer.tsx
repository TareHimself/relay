import { css } from '@linaria/core'
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  ScrollArea,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Page } from '@shared/pages'
import { useDisplayName } from '../../api/identity'
import { ApiError, errorMessage } from '../../api/http'
import {
  keys,
  useHistory,
  useRestoreVersion,
  useVersion,
  type HistoryEntry,
} from '../../api/queries'
import { lineDiff, type DiffKind } from '../../lib/lineDiff'
import { timeAgo } from '../../lib/timeAgo'

const row = css`
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--mantine-radius-md);
  text-align: left;

  &:hover {
    background: var(--mantine-color-default-hover);
  }

  &[data-selected='true'] {
    border-color: var(--mantine-color-green-5);
    background: var(--mantine-color-green-light);
  }
`
const diffBox = css`
  font-family: var(--mantine-font-family-monospace);
  font-size: 12px;
  line-height: 1.5;
  border: 1px solid var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-md);
  overflow: hidden;
`
const diffLine = css`
  padding: 0 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-height: 1.5em;

  &[data-kind='add'] {
    background: var(--mantine-color-green-light);
  }

  &[data-kind='del'] {
    background: var(--mantine-color-red-light);
    text-decoration: line-through;
    text-decoration-color: var(--mantine-color-red-5);
  }

  &[data-kind='gap'] {
    padding-top: 4px;
    padding-bottom: 4px;
    color: var(--mantine-color-dimmed);
    background: var(--mantine-color-default-hover);
    font-family: var(--mantine-font-family);
    font-size: 11px;
  }
`
const plainText = css`
  margin: 0;
  padding: 10px;
  font-family: var(--mantine-font-family-monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border: 1px solid var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-md);
`

const MARKERS: Record<DiffKind, string> = { add: '+ ', del: '− ', ctx: '  ', gap: '⋯ ' }

function describe(entry: HistoryEntry): string {
  const verb = entry.subject.split(':')[0]
  if (verb === 'create') return 'Created'
  if (verb === 'restore') return 'Restored an earlier version'
  return 'Edited'
}

interface VersionsPanelProps {
  page: Page
  onClose: () => void
  beforeRestore: () => Promise<void>
}

function VersionsPanel({ page, onClose, beforeRestore }: VersionsPanelProps) {
  const queryClient = useQueryClient()
  const history = useHistory(page.id)
  const nameOf = useDisplayName()
  const restore = useRestoreVersion(page.id)
  const entries = history.data ?? []
  const head = entries[0]?.hash ?? ''
  const [picked, setPicked] = useState<string | null>(null)
  const [mode, setMode] = useState<'changes' | 'text'>('changes')
  const [confirming, setConfirming] = useState(false)

  const selected = picked ?? entries[1]?.hash ?? null

  function select(hash: string) {
    setPicked(hash)
    setConfirming(false)
    restore.reset()
  }

  const chosen = entries.find((entry) => entry.hash === selected)
  const isCurrent = chosen !== undefined && chosen.hash === head
  const version = useVersion(page.id, isCurrent ? null : selected)
  const parsed = useMemo(
    () => (version.data ? lineDiff(page.body, version.data.body) : undefined),
    [page.body, version.data],
  )

  async function confirmRestore() {
    if (!chosen) return
    await beforeRestore()
    const latest = queryClient.getQueryData<Page>(keys.page(page.id)) ?? page
    try {
      await restore.mutateAsync({ hash: chosen.hash, ifRevision: latest.revision })
      onClose()
    } catch {
      setConfirming(false)
    }
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Every save is kept. Restoring makes an older version the newest one, and the current text
        stays in this list.
      </Text>

      {history.isPending && (
        <Stack gap={6}>
          <Skeleton height={48} radius="md" />
          <Skeleton height={48} radius="md" />
          <Skeleton height={48} radius="md" />
        </Stack>
      )}
      {history.error && <Alert color="red">{errorMessage(history.error)}</Alert>}

      <ScrollArea.Autosize mah={280} type="auto">
        <Stack gap={2} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
          {entries.map((entry, index) => (
            <li key={entry.hash}>
              <UnstyledButton
                className={row}
                data-selected={entry.hash === selected}
                aria-pressed={entry.hash === selected}
                onClick={() => select(entry.hash)}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="sm" fw={600}>
                    {describe(entry)}
                  </Text>
                  {index === 0 && (
                    <Badge size="xs" variant="light" color="green">
                      Current
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed" title={new Date(entry.date).toLocaleString()}>
                  {nameOf(entry.handle)} · {timeAgo(entry.date)}
                </Text>
              </UnstyledButton>
            </li>
          ))}
        </Stack>
      </ScrollArea.Autosize>

      {chosen && isCurrent && (
        <Text size="sm" c="dimmed">
          This is the current version.
        </Text>
      )}

      {chosen && !isCurrent && (
        <Stack gap="sm">
          <Group justify="space-between">
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(value) => setMode(value as 'changes' | 'text')}
              data={[
                { label: 'Changes', value: 'changes' },
                { label: 'Full text', value: 'text' },
              ]}
            />
            {mode === 'changes' && parsed && (
              <Text size="xs" c="dimmed">
                Restoring adds {parsed.added} and removes {parsed.removed} lines
              </Text>
            )}
          </Group>

          {mode === 'changes' && (
            <ScrollArea.Autosize mah={300} type="auto">
              {version.isPending && <Loader size="xs" />}
              {version.error && <Alert color="red">{errorMessage(version.error)}</Alert>}
              {parsed === null && (
                <Text size="sm" c="dimmed">
                  This version is too different to preview line by line. Use Full text.
                </Text>
              )}
              {parsed && parsed.lines.length === 0 && (
                <Text size="sm" c="dimmed">
                  No differences from the current text.
                </Text>
              )}
              {parsed && parsed.lines.length > 0 && (
                <div className={diffBox} aria-label="Changes if restored">
                  {parsed.lines.map((line, index) => (
                    <div key={index} className={diffLine} data-kind={line.kind}>
                      {MARKERS[line.kind]}
                      {line.text}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea.Autosize>
          )}

          {mode === 'text' && (
            <ScrollArea.Autosize mah={300} type="auto">
              {version.isPending && <Loader size="xs" />}
              {version.data && <pre className={plainText}>{version.data.body}</pre>}
            </ScrollArea.Autosize>
          )}

          {restore.error && (
            <Alert color="red">
              {restore.error instanceof ApiError && restore.error.status === 409
                ? 'The page changed while this was open. Reopen the history and try again.'
                : errorMessage(restore.error)}
            </Alert>
          )}

          {confirming ? (
            <Alert color="yellow" title="Restore this version?">
              <Text size="sm" mb="sm">
                The text from {timeAgo(chosen.date)} becomes the newest version. What you have now
                stays in the history.
              </Text>
              <Group gap="xs">
                <Button size="xs" loading={restore.isPending} onClick={() => void confirmRestore()}>
                  Restore
                </Button>
                <Button size="xs" variant="default" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </Group>
            </Alert>
          ) : (
            <Button variant="light" onClick={() => setConfirming(true)}>
              Restore this version
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  )
}

interface VersionsDrawerProps extends VersionsPanelProps {
  opened: boolean
}

export function VersionsDrawer({ opened, ...panel }: VersionsDrawerProps) {
  return (
    <Drawer
      opened={opened}
      onClose={panel.onClose}
      position="right"
      size={460}
      title="Version history"
      padding="md"
    >
      <VersionsPanel {...panel} />
    </Drawer>
  )
}
