import {
  ActionIcon,
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import type { CreatedToken } from '@shared/tokens'

interface CopyRowProps {
  label: string
  value: string
}

function CopyRow({ label, value }: CopyRowProps) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Code block flex={1} style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
          {value}
        </Code>
        <CopyButton value={value} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
              <ActionIcon
                variant="subtle"
                color={copied ? 'green' : 'gray'}
                onClick={copy}
                aria-label={`Copy ${label}`}
              >
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </Stack>
  )
}

interface TokenSecretDialogProps {
  token: CreatedToken | null
  opened: boolean
  onClose: () => void
  onExited: () => void
}

export function TokenSecretDialog({ token, opened, onClose, onExited }: TokenSecretDialogProps) {
  const endpoint = `${window.location.origin}/mcp`
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      onExitTransitionEnd={onExited}
      title={`Token "${token?.name ?? ''}" created`}
      size="lg"
      centered
    >
      {token && (
        <Stack gap="md">
          <Alert color="yellow" title="Copy it now">
            This is the only time the token is shown. Relay stores just a hash of it.
          </Alert>
          <CopyRow label="API token" value={token.token} />
          <CopyRow label="MCP endpoint" value={endpoint} />
          <CopyRow label="Authorization header" value={`Authorization: Bearer ${token.token}`} />
          <CopyRow
            label="MCP client config"
            value={JSON.stringify({
              mcpServers: {
                relay: {
                  type: 'http',
                  url: endpoint,
                  headers: { Authorization: `Bearer ${token.token}` },
                },
              },
            })}
          />
          <Group justify="flex-end">
            <Button onClick={onClose}>Done</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
