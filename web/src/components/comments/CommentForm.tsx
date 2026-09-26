import { Button, Group, Stack } from '@mantine/core'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { errorMessage } from '../../api/http'
import { MentionTextarea } from './MentionTextarea'

interface CommentFormProps {
  placeholder: string
  submitLabel: string
  initialValue?: string
  autoFocus?: boolean
  onSubmit: (body: string) => Promise<void>
  onCancel?: () => void
}

export function CommentForm({
  placeholder,
  submitLabel,
  initialValue,
  autoFocus,
  onSubmit,
  onCancel,
}: CommentFormProps) {
  const [body, setBody] = useState(initialValue ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const trimmed = body.trim()
  const canSubmit = trimmed !== '' && trimmed !== initialValue?.trim()
  const root = useRef<HTMLDivElement>(null)
  const dismissable = onCancel !== undefined && !canSubmit && !busy

  useEffect(() => {
    if (!dismissable) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      const card = root.current?.closest('article') ?? root.current
      if (card?.contains(target ?? null) || target?.closest('.mantine-Popover-dropdown')) return
      onCancel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [dismissable, onCancel])

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onSubmit(trimmed)
      if (initialValue === undefined) setBody('')
      setError(undefined)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && onCancel) {
      event.stopPropagation()
      onCancel()
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <Stack ref={root} gap="xs" onClick={(event) => event.stopPropagation()}>
      <MentionTextarea
        autoFocus={autoFocus ?? false}
        placeholder={placeholder}
        value={body}
        error={error}
        onChange={setBody}
        onKeyDown={onKeyDown}
      />
      <Group gap="xs" justify="flex-end">
        <Group gap="xs">
          {onCancel && (
            <Button size="compact-xs" variant="subtle" color="gray" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            size="compact-xs"
            loading={busy}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {submitLabel}
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}
