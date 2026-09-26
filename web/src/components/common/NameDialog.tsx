import { Button, Group, Modal, TextInput } from '@mantine/core'
import { useState, type FormEvent } from 'react'
import { NO_WRITING_ASSISTANT } from '../../editor/writingAssistants'

interface NameDialogProps {
  opened: boolean
  title: string
  label: string
  busy: boolean
  error: string | undefined
  onSubmit: (name: string) => void
  onClose: () => void
}

function NameForm({
  label,
  busy,
  error,
  onSubmit,
  onClose,
}: Pick<NameDialogProps, 'label' | 'busy' | 'error' | 'onSubmit' | 'onClose'>) {
  const [value, setValue] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const name = value.trim()
    if (name) onSubmit(name)
  }

  return (
    <form onSubmit={submit}>
      <TextInput
        data-autofocus
        label={label}
        value={value}
        error={error}
        onChange={(event) => setValue(event.currentTarget.value)}
        {...NO_WRITING_ASSISTANT}
      />
      <Group justify="flex-end" mt="md">
        <Button variant="subtle" color="gray" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} disabled={!value.trim()}>
          Create
        </Button>
      </Group>
    </form>
  )
}

export function NameDialog({ opened, title, onClose, ...form }: NameDialogProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} size="sm" centered>
      <NameForm {...form} onClose={onClose} />
    </Modal>
  )
}
