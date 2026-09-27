import { SimpleGrid, Stack, Title } from '@mantine/core'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useProjectPages, useProjects } from '../api/queries'
import { DocCard, NewDocCard } from '../components/home/DocCard'
import { ProjectDescription } from '../components/home/ProjectDescription'
import { NewDocDialog } from '../components/layout/NewDocDialog'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function ProjectHome() {
  const { projectId } = useParams()
  const project = useProjects().data?.find((p) => p.id === projectId)
  const pages = useProjectPages(projectId).data
  const [creating, setCreating] = useState(false)
  useDocumentTitle(project?.name)
  const recent = useMemo(
    () => [...(pages ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [pages],
  )
  if (!project) return null

  return (
    <Stack gap="lg" maw={1152} mx="auto" pt="md">
      <Stack gap={4}>
        <Title order={1}>{project.name}</Title>
        <ProjectDescription project={project} />
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md">
        {recent.map((page) => (
          <DocCard key={page.id} projectId={project.id} page={page} />
        ))}
        <NewDocCard onClick={() => setCreating(true)} />
      </SimpleGrid>
      <NewDocDialog projectId={project.id} opened={creating} onClose={() => setCreating(false)} />
    </Stack>
  )
}
