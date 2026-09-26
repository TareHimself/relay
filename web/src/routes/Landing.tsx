import { Navigate } from 'react-router'
import { useProjects } from '../api/queries'
import { EmptyState } from '../components/common/EmptyState'
import { projectPath } from '../lib/paths'

export function Landing() {
  const projects = useProjects()
  if (!projects.data) return null
  const first = projects.data[0]
  if (first) return <Navigate to={projectPath(first.id)} replace />
  return (
    <EmptyState
      title="Welcome to Relay"
      description="Create a project from the switcher in the sidebar to start writing."
    />
  )
}
