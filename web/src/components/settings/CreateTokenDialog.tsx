import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useState, type FormEvent } from 'react'
import type { CreatedToken, TokenScope } from '@shared/tokens'
import { HANDLE_PATTERN } from '@shared/tokens'
import { errorMessage } from '../../api/http'
import { useCreateToken, useProjects } from '../../api/queries'
import { NO_WRITING_ASSISTANT } from '../../editor/writingAssistants'

const EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: '365', label: 'In 1 year' },
]
const DAY_MS = 86_400_000

interface CreateTokenDialogProps {
  opened: boolean
  onClose: () => void
  onCreated: (token: CreatedToken) => void
}

function TokenForm({ onClose, onCreated }: Omit<CreateTokenDialogProps, 'opened'>) {
  const create = useCreateToken()
  const projects = useProjects().data ?? []
  const [name, setName] = useState('')
  const [scope, setScope] = useState<TokenScope>('write')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [expiry, setExpiry] = useState('never')
  const handle = name.trim().toLowerCase()
  const nameError =
    handle && !HANDLE_PATTERN.test(handle) ? 'Use lowercase letters, numbers, - or _' : undefined

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate(
      {
        name: handle,
        scope,
        ...(projectId ? { projectId } : {}),
        ...(expiry === 'never'
          ? {}
          : { expiresAt: new Date(Date.now() + Number(expiry) * DAY_MS).toISOString() }),
      },
      {
        onSuccess: (token) => {
          onCreated(token)
          onClose()
        },
      },
    )
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <TextInput
          data-autofocus
          label="Name"
          description="Also the agent's @handle and the author on its commits"
          placeholder="review-bot"
          value={name}
          error={nameError ?? (create.error ? errorMessage(create.error) : undefined)}
          onChange={(event) => setName(event.currentTarget.value)}
          {...NO_WRITING_ASSISTANT}
        />
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Access
          </Text>
          <SegmentedControl
            value={scope}
            onChange={(value) => setScope(value as TokenScope)}
            data={[
              { label: 'Read and write', value: 'write' },
              { label: 'Read only', value: 'read' },
            ]}
          />
        </Stack>
        <Select
          label="Project"
          data={[
            { value: '', label: 'All projects' },
            ...projects.map((project) => ({ value: project.id, label: project.name })),
          ]}
          value={projectId ?? ''}
          onChange={(value) => setProjectId(value || null)}
          allowDeselect={false}
        />
        <Select
          label="Expires"
          data={EXPIRY_OPTIONS}
          value={expiry}
          onChange={(value) => setExpiry(value ?? 'never')}
          allowDeselect={false}
        />
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!handle || !!nameError}>
            Create token
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export function CreateTokenDialog({ opened, onClose, onCreated }: CreateTokenDialogProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="New API token" size="md" centered>
      <TokenForm onClose={onClose} onCreated={onCreated} />
    </Modal>
  )
}
