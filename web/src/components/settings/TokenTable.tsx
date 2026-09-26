import { ActionIcon, Badge, Table, Text, Tooltip } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import type { Project } from '@shared/pages'
import type { TokenRecord } from '@shared/tokens'
import { timeAgo } from '../../lib/timeAgo'

interface TokenTableProps {
  tokens: TokenRecord[]
  projects: Project[]
  onRevoke: (token: TokenRecord) => void
}

export function TokenTable({ tokens, projects, onRevoke }: TokenTableProps) {
  const projectName = (id: string | null) =>
    id === null ? 'All projects' : (projects.find((p) => p.id === id)?.name ?? 'Unknown project')
  return (
    <Table verticalSpacing="sm" highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Access</Table.Th>
          <Table.Th>Project</Table.Th>
          <Table.Th>Last used</Table.Th>
          <Table.Th>Expires</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {tokens.map((token) => (
          <Table.Tr key={token.id}>
            <Table.Td>
              <Text fw={600}>@{token.name}</Text>
            </Table.Td>
            <Table.Td>
              <Badge variant="light" color={token.scope === 'write' ? 'green' : 'gray'}>
                {token.scope === 'write' ? 'Read and write' : 'Read only'}
              </Badge>
            </Table.Td>
            <Table.Td>{projectName(token.projectId)}</Table.Td>
            <Table.Td>{token.lastUsedAt ? timeAgo(token.lastUsedAt) : 'Never'}</Table.Td>
            <Table.Td>
              {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : 'Never'}
            </Table.Td>
            <Table.Td>
              <Tooltip label="Revoke token" openDelay={300}>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`Revoke ${token.name}`}
                  onClick={() => onRevoke(token)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
