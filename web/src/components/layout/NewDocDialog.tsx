import { useNavigate } from 'react-router'
import { errorMessage } from '../../api/http'
import { useCreatePage } from '../../api/queries'
import { docPath } from '../../lib/paths'
import { NameDialog } from '../common/NameDialog'

interface NewDocDialogProps {
  projectId: string
  opened: boolean
  onClose: () => void
}

export function NewDocDialog({ projectId, opened, onClose }: NewDocDialogProps) {
  const navigate = useNavigate()
  const create = useCreatePage(projectId)

  return (
    <NameDialog
      opened={opened}
      title="New doc"
      label="Doc title"
      busy={create.isPending}
      error={create.error ? errorMessage(create.error) : undefined}
      onSubmit={(title) =>
        create.mutate(
          { title },
          {
            onSuccess: (page) => {
              onClose()
              void navigate(docPath(projectId, page.id))
            },
          },
        )
      }
      onClose={() => {
        onClose()
        create.reset()
      }}
    />
  )
}
