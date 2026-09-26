import { Button, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import type { CreatedToken, TokenRecord } from '@shared/tokens'
import { errorMessage } from '../../api/http'
import { useProjects, useRevokeToken, useTokens } from '../../api/queries'
import { ErrorNotice } from '../common/ErrorNotice'
import { CreateTokenDialog } from './CreateTokenDialog'
import { TokenSecretDialog } from './TokenSecretDialog'
import { TokenTable } from './TokenTable'

export function TokensSection() {
  const tokens = useTokens()
  const projects = useProjects().data ?? []
  const revoke = useRevokeToken()
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedToken | null>(null)
  const [secretOpen, setSecretOpen] = useState(false)

  function revokeToken(token: TokenRecord) {
    if (window.confirm(`Revoke "${token.name}"? Anything using it will stop working.`)) {
      revoke.mutate(token.id)
    }
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={3}>API tokens</Title>
          <Text size="sm" c="dimmed">
            Tokens let agents read and edit through MCP and the REST API.
          </Text>
        </Stack>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
          New token
        </Button>
      </Group>
      {tokens.error && <ErrorNotice message={errorMessage(tokens.error)} />}
      {revoke.error && <ErrorNotice message={errorMessage(revoke.error)} />}
      {tokens.isPending && <Loader size="sm" />}
      {tokens.data &&
        (tokens.data.length > 0 ? (
          <TokenTable tokens={tokens.data} projects={projects} onRevoke={revokeToken} />
        ) : (
          <Text c="dimmed">No tokens yet. Create one to connect an agent.</Text>
        ))}
      <CreateTokenDialog
        opened={creating}
        onClose={() => setCreating(false)}
        onCreated={(token) => {
          setCreated(token)
          setSecretOpen(true)
        }}
      />
      <TokenSecretDialog
        token={created}
        opened={secretOpen}
        onClose={() => setSecretOpen(false)}
        onExited={() => setCreated(null)}
      />
    </Stack>
  )
}
