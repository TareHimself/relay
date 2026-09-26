import type { EditorView } from '@codemirror/view'
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { useState, type FormEvent } from 'react'
import { linkMarkdown, normalizeLink, type LinkDraft } from '../../editor/link'
import { useUiStore } from '../../stores/uiStore'

interface LinkFormProps {
  draft: LinkDraft
  view: EditorView | null
  onClose: () => void
}

function LinkForm({ draft, view, onClose }: LinkFormProps) {
  const [text, setText] = useState(draft.label)
  const [url, setUrl] = useState(draft.url)
  const normalized = normalizeLink(url)
  const invalid = url.trim() !== '' && normalized === null

  function replace(insert: string) {
    if (!view) return
    const max = view.state.doc.length
    const from = Math.min(draft.from, max)
    const to = Math.min(draft.to, max)
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent: 'input',
    })
    onClose()
  }

  function apply(event: FormEvent) {
    event.preventDefault()
    if (!normalized) return
    replace(linkMarkdown(text.trim() || url.trim(), normalized))
  }

  return (
    <form onSubmit={apply}>
      <Stack gap="sm">
        <TextInput
          label="Text"
          placeholder="Text to show"
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        <TextInput
          label="Link"
          placeholder="https://example.com"
          data-autofocus
          value={url}
          error={invalid ? 'That link type is not allowed' : undefined}
          onChange={(event) => setUrl(event.currentTarget.value)}
        />
        <Group justify={draft.editing ? 'space-between' : 'flex-end'} mt="xs">
          {draft.editing && (
            <Button variant="subtle" color="red" onClick={() => replace(text.trim() || url)}>
              Remove link
            </Button>
          )}
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={normalized === null}>
              {draft.editing ? 'Update' : 'Add link'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  )
}

interface LinkDialogProps {
  view: EditorView | null
}

export function LinkDialog({ view }: LinkDialogProps) {
  const draft = useUiStore((state) => state.linkDraft)
  const closeLink = useUiStore((state) => state.closeLink)

  function close() {
    closeLink()
    window.setTimeout(() => view?.focus(), 0)
  }

  return (
    <Modal
      opened={draft !== null}
      onClose={close}
      title={draft?.editing ? 'Edit link' : 'Add link'}
      size="sm"
      centered
    >
      {draft && <LinkForm draft={draft} view={view} onClose={close} />}
    </Modal>
  )
}
