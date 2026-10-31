import { Button, Group, Stack, Text, Title } from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'

export function BackupSection() {
  return (
    <Stack gap="sm">
      <Title order={3}>Backup</Title>
      <Text size="sm" c="dimmed">
        One archive with every project, page, version, comment thread, token and account. Restore it
        on a new machine with RESTORE_FROM. Keep it private: it includes password and token hashes.
      </Text>
      <Group>
        <Button
          variant="default"
          leftSection={<IconDownload size={16} />}
          onClick={() => window.location.assign('/api/backup')}
        >
          Download backup
        </Button>
      </Group>
    </Stack>
  )
}
