import { Alert, Button, Group } from '@mantine/core'

interface ConflictBannerProps {
  onLoadLatest: () => void
  onKeepMine: () => void
}

export function ConflictBanner({ onLoadLatest, onKeepMine }: ConflictBannerProps) {
  return (
    <Alert color="yellow" title="This doc was changed elsewhere">
      <Group gap="xs">
        <Button size="compact-sm" variant="light" onClick={onLoadLatest}>
          Load latest (discard my edits)
        </Button>
        <Button size="compact-sm" variant="subtle" color="gray" onClick={onKeepMine}>
          Keep mine (overwrite)
        </Button>
      </Group>
    </Alert>
  )
}
