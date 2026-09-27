import { Button, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage } from '../api/http'
import { useCreateProject, useProjects } from '../api/queries'
import { EmptyState } from '../components/common/EmptyState'
import { NameDialog } from '../components/common/NameDialog'
import { NewProjectCard, ProjectCard } from '../components/home/ProjectCard'
import { projectPath } from '../lib/paths'

export function Landing() {
  const projects = useProjects()
  const create = useCreateProject()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  function createProject(name: string) {
    create.mutate(
      { name },
      {
        onSuccess: (project) => {
          setCreating(false)
          void navigate(projectPath(project.id))
        },
      },
    )
  }

  if (!projects.data) return null

  const dialog = (
    <NameDialog
      opened={creating}
      title="New project"
      label="Project name"
      busy={create.isPending}
      error={create.error ? errorMessage(create.error) : undefined}
      onSubmit={createProject}
      onClose={() => {
        setCreating(false)
        create.reset()
      }}
    />
  )

  if (projects.data.length === 0) {
    return (
      <>
        <EmptyState
          title="Welcome to Relay"
          description="Create a project to start writing."
          action={
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
              New project
            </Button>
          }
        />
        {dialog}
      </>
    )
  }

  return (
    <Stack gap="lg" maw={1152} mx="auto" pt="md">
      <Stack gap={4}>
        <Title order={1}>Projects</Title>
        <Text c="dimmed">Pick a project, or start a new one.</Text>
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md">
        {projects.data.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        <NewProjectCard onClick={() => setCreating(true)} />
      </SimpleGrid>
      {dialog}
    </Stack>
  )
}
