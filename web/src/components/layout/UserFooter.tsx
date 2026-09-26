import { ActionIcon, Group, Text, Tooltip } from '@mantine/core'
import { IconLogout } from '@tabler/icons-react'
import { useLogout, useWhoami } from '../../api/queries'

export function UserFooter() {
  const me = useWhoami().data
  const logout = useLogout()
  if (!me) return null
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs" px="xs">
      <Text size="xs" c="dimmed" truncate>
        {me.displayName}
      </Text>
      <Tooltip label="Sign out" openDelay={300}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Sign out"
          loading={logout.isPending}
          onClick={() => logout.mutate()}
        >
          <IconLogout size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
