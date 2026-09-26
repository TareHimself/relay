import { ActionIcon, Badge, Stack, Table, Text, Title, Tooltip } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { errorMessage } from '../../api/http'
import { useRevokeSession, useSessions, useWhoami } from '../../api/queries'
import { timeAgo } from '../../lib/timeAgo'
import { ErrorNotice } from '../common/ErrorNotice'

export function SessionsSection() {
  const me = useWhoami().data
  const sessions = useSessions()
  const revoke = useRevokeSession()
  if (!me?.session) return null

  return (
    <Stack gap="sm">
      <Title order={3}>Signed-in devices</Title>
      {sessions.error && <ErrorNotice message={errorMessage(sessions.error)} />}
      {revoke.error && <ErrorNotice message={errorMessage(revoke.error)} />}
      {sessions.data && (
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Browser</Table.Th>
              <Table.Th>Signed in</Table.Th>
              <Table.Th>Last active</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sessions.data.map((session) => (
              <Table.Tr key={session.id}>
                <Table.Td maw={360}>
                  <Text size="sm" lineClamp={1} title={session.userAgent}>
                    {session.userAgent || 'Unknown browser'}
                  </Text>
                  {session.current && (
                    <Badge size="xs" variant="light" color="green">
                      This device
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{timeAgo(session.createdAt)}</Table.Td>
                <Table.Td>{timeAgo(session.lastSeenAt)}</Table.Td>
                <Table.Td>
                  {!session.current && (
                    <Tooltip label="Sign this device out" openDelay={300}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Sign this device out"
                        onClick={() => revoke.mutate(session.id)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  )
}
