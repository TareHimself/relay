import { Button, Group, Stack, Text, Textarea, Title } from '@mantine/core'
import { useState } from 'react'
import { errorMessage } from '../../api/http'

interface InstructionsEditorProps {
  title: string
  description: string
  saved: string
  placeholder?: string
  saving: boolean
  error: unknown
  onSave: (text: string) => void
  onReset?: (() => void) | undefined
}

export function InstructionsEditor({
  title,
  description,
  saved,
  placeholder,
  saving,
  error,
  onSave,
  onReset,
}: InstructionsEditorProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? saved
  const changed = draft !== null && draft !== saved

  return (
    <Stack gap="sm">
      <Stack gap={2}>
        <Title order={3}>{title}</Title>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      </Stack>
      <Textarea
        aria-label={title}
        autosize
        minRows={6}
        maxRows={24}
        placeholder={placeholder}
        value={value}
        error={error ? errorMessage(error) : undefined}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
      <Group gap="sm">
        <Button
          loading={saving}
          disabled={!changed}
          onClick={() => {
            if (draft !== null) onSave(draft)
            setDraft(null)
          }}
        >
          Save
        </Button>
        {changed && (
          <Button variant="default" onClick={() => setDraft(null)}>
            Discard changes
          </Button>
        )}
        {onReset && (
          <Button variant="subtle" color="gray" onClick={onReset}>
            Reset to default
          </Button>
        )}
      </Group>
    </Stack>
  )
}
