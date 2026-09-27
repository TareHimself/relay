import { Navigate, useParams } from 'react-router'
import { usePageProject } from '../api/queries'
import { EmptyState } from '../components/common/EmptyState'
import { docPath } from '../lib/paths'

export function DocRedirect() {
  const { docId } = useParams()
  const project = usePageProject(docId)

  if (project.isError) {
    return (
      <EmptyState
        title="Doc not found"
        description="This link may be stale, or the doc was deleted."
      />
    )
  }
  if (!project.data) return null
  return <Navigate to={docPath(project.data.projectId, project.data.id)} replace />
}
