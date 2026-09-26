import { Loader } from '@mantine/core'
import { useParams } from 'react-router'
import { errorMessage } from '../api/http'
import { usePage, useProjects } from '../api/queries'
import { ErrorNotice } from '../components/common/ErrorNotice'
import { DocView } from '../components/doc/DocView'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function DocRoute() {
  const { docId } = useParams()
  const page = usePage(docId)
  const projects = useProjects()
  const project = projects.data?.find((p) => p.id === page.data?.projectId)
  useDocumentTitle(page.data?.title, project?.name)

  if (page.error) return <ErrorNotice message={errorMessage(page.error)} />
  if (!page.data) return <Loader size="sm" />
  return <DocView key={page.data.id} page={page.data} projectName={project?.name} />
}
