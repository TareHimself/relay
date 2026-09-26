import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import type { Page } from '@shared/pages'
import { ApiError, errorMessage } from '../../api/http'
import { keys, useDeletePage } from '../../api/queries'
import { projectPath } from '../../lib/paths'

interface DeletePanelProps {
  page: Page
  commentCount: number
  onClose: () => void
  beforeDelete: () => Promise<void>
}

function DeletePanel({ page, commentCount, onClose, beforeDelete }: DeletePanelProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const remove = useDeletePage(page.projectId)

  async function confirm() {
    await beforeDelete()
    const latest = queryClient.getQueryData<Page>(keys.page(page.id)) ?? page
    try {
      await remove.mutateAsync({ pageId: page.id, ifRevision: latest.revision })
      void navigate(projectPath(page.projectId))
    } catch {
      return
    }
  }

  const comments =
    commentCount === 0
      ? ''
      : ` and its ${commentCount} comment thread${commentCount === 1 ? '' : 's'}`

  return (
    <Stack gap="md">
      <Text size="sm">
        <b>{page.title}</b>
        {comments} will be removed from Relay. This cannot be undone from the app. The history is
        kept in the data repository, so an administrator can still recover it.
      </Text>
      {remove.error && (
        <Alert color="red">
          {remove.error instanceof ApiError && remove.error.status === 409
            ? 'The doc changed while this dialog was open. Close it and look at the latest version first.'
            : errorMessage(remove.error)}
        </Alert>
      )}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button color="red" loading={remove.isPending} onClick={() => void confirm()}>
          Delete doc
        </Button>
      </Group>
    </Stack>
  )
}

interface DeleteDocDialogProps extends DeletePanelProps {
  opened: boolean
}

export function DeleteDocDialog({ opened, ...panel }: DeleteDocDialogProps) {
  return (
    <Modal opened={opened} onClose={panel.onClose} title="Delete this doc?" size="sm" centered>
      <DeletePanel {...panel} />
    </Modal>
  )
}
