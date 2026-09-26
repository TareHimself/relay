import { Badge, Group, Popover, Stack, Text, Textarea, UnstyledButton } from '@mantine/core'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useCurrentActor } from '../../api/identity'
import { usePeople } from '../../api/queries'
import { NO_WRITING_ASSISTANT } from '../../editor/writingAssistants'
import { activeMention, insertMention, suggestPeople } from '../../lib/mentions'

interface MentionTextareaProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent) => void
  placeholder: string
  autoFocus: boolean
  error: string | undefined
}

export function MentionTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  autoFocus,
  error,
}: MentionTextareaProps) {
  const people = usePeople().data
  const me = useCurrentActor()
  const input = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [caret, setCaret] = useState(0)
  const [nav, setNav] = useState({ key: '', index: 0 })
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  const mention = activeMention(value, caret)
  const suggestions = useMemo(
    () => (mention && people ? suggestPeople(people, mention.query, me) : []),
    [mention, people, me],
  )
  const open = mention !== null && mention.start !== dismissedAt && suggestions.length > 0
  const tokenKey = mention ? `${mention.start}:${mention.query}` : ''
  const highlight = nav.key === tokenKey ? nav.index : 0

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true })
  }, [autoFocus])
  useEffect(() => {
    if (pendingCaret.current === null || !input.current) return
    input.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  }, [value])

  function track(text: string, position: number) {
    setCaret(position)
    if (!activeMention(text, position)) setDismissedAt(null)
  }

  function syncCaret() {
    if (input.current) track(value, input.current.selectionStart)
  }

  function choose(handle: string) {
    if (!mention) return
    const next = insertMention(value, mention, handle)
    pendingCaret.current = next.caret
    track(next.text, next.caret)
    onChange(next.text)
    input.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (open) {
      const step = (delta: number) => {
        event.preventDefault()
        setNav({
          key: tokenKey,
          index: (highlight + delta + suggestions.length) % suggestions.length,
        })
      }
      if (event.key === 'ArrowDown') return step(1)
      if (event.key === 'ArrowUp') return step(-1)
      if ((event.key === 'Enter' && !event.ctrlKey && !event.metaKey) || event.key === 'Tab') {
        event.preventDefault()
        const chosen = suggestions[highlight]
        if (chosen) choose(chosen.handle)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setDismissedAt(mention.start)
        return
      }
    }
    onKeyDown(event)
  }

  return (
    <Popover opened={open} position="bottom-start" width={260} shadow="md" withinPortal>
      <Popover.Target>
        <Textarea
          ref={input}
          size="xs"
          autosize
          minRows={2}
          placeholder={placeholder}
          value={value}
          error={error}
          onChange={(event) => {
            onChange(event.currentTarget.value)
            track(event.currentTarget.value, event.currentTarget.selectionStart)
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onBlur={() => setDismissedAt(null)}
          {...NO_WRITING_ASSISTANT}
        />
      </Popover.Target>
      <Popover.Dropdown p={4} onMouseDown={(event) => event.preventDefault()}>
        <Stack gap={2} role="listbox" aria-label="Mention suggestions">
          {suggestions.map((person, index) => (
            <UnstyledButton
              key={person.handle}
              role="option"
              aria-selected={index === highlight}
              px="xs"
              py={6}
              style={{
                borderRadius: 'var(--mantine-radius-sm)',
                background:
                  index === highlight ? 'var(--mantine-color-default-hover)' : 'transparent',
              }}
              onMouseEnter={() => setNav({ key: tokenKey, index })}
              onClick={() => choose(person.handle)}
            >
              <Group gap="xs" wrap="nowrap" justify="space-between">
                <Stack gap={0} miw={0}>
                  <Text size="sm" fw={600} truncate>
                    @{person.handle}
                  </Text>
                  {person.displayName !== person.handle && (
                    <Text size="xs" c="dimmed" truncate>
                      {person.displayName}
                    </Text>
                  )}
                </Stack>
                {person.kind === 'agent' && (
                  <Badge size="xs" variant="light" color="gray">
                    agent
                  </Badge>
                )}
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
