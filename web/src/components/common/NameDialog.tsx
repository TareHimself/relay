import { Button, Group, Modal, TextInput } from '@mantine/core'
import { useEffect, useState, type FormEvent } from 'react'
import { NO_WRITING_ASSISTANT } from '../../editor/writingAssistants'

interface NameDialogProps {
  opened: boolean
  title: string
  label: string
  initialValue?: string | undefined
  submitLabel?: string | undefined
  busy: boolean
  error: string | undefined
  onSubmit: (name: string) => void
  onClose: () => void
}

function NameForm({
  opened,
  label,
  initialValue,
  submitLabel,
  busy,
  error,
  onSubmit,
  onClose,
}: Pick<
  NameDialogProps,
  'opened' | 'label' | 'initialValue' | 'submitLabel' | 'busy' | 'error' | 'onSubmit' | 'onClose'
>) {
  const [value, setValue] = useState(initialValue ?? '')

  useEffect(() => {
    if (opened) setValue(initialValue ?? '')
  }, [opened, initialValue])

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
          {submitLabel ?? 'Create'}
        </Button>
      </Group>
    </form>
  )
}

export function NameDialog({ opened, title, onClose, ...form }: NameDialogProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} size="sm" centered>
      <NameForm {...form} opened={opened} onClose={onClose} />
    </Modal>
  )
}
