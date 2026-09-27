import { css } from '@linaria/core'
import { ActionIcon, Group, Menu, Skeleton, Text, UnstyledButton } from '@mantine/core'
import { IconCheck, IconHome, IconPencil, IconPlus, IconSelector } from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Project } from '@shared/pages'
import { errorMessage } from '../../api/http'
import { useCreateProject, useRenameProject } from '../../api/queries'
import { projectPath } from '../../lib/paths'
import { NameDialog } from '../common/NameDialog'

const trigger = css`
  width: 100%;
  padding: 8px;
  border-radius: var(--mantine-radius-md);

  &:hover {
    background: var(--mantine-color-default-border);
  }
`
interface ProjectSwitcherProps {
  projects: Project[]
  current: Project | undefined
  loading: boolean
}

export function ProjectSwitcher({ projects, current, loading }: ProjectSwitcherProps) {
  const navigate = useNavigate()
  const create = useCreateProject()
  const rename = useRenameProject()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Project | null>(null)

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

  function renameProject(name: string) {
    if (!renameTarget) return
    rename.mutate({ id: renameTarget.id, name }, { onSuccess: () => setRenameTarget(null) })
  }

  return (
    <>
      <Menu
        width={248}
        position="bottom-start"
        shadow="md"
        opened={switcherOpen}
        onChange={setSwitcherOpen}
      >
        <Menu.Target>
          <UnstyledButton className={trigger}>
            <Group gap="xs" wrap="nowrap">
              {loading ? (
                <Skeleton height={14} flex={1} />
              ) : (
                <Text fw={600} size="sm" truncate flex={1}>
                  {current?.name ?? 'Select a project'}
                </Text>
              )}
              <IconSelector size={16} opacity={0.6} />
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconHome size={14} />} onClick={() => void navigate('/')}>
            Home
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>Projects</Menu.Label>
          {projects.map((project) => (
            <Menu.Item
              key={project.id}
              onClick={() => void navigate(projectPath(project.id))}
              rightSection={
                <Group gap={4} wrap="nowrap">
                  {project.id === current?.id && <IconCheck size={14} />}
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Rename ${project.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSwitcherOpen(false)
                      setRenameTarget(project)
                    }}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                </Group>
              }
            >
              <Text truncate>{project.name}</Text>
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>
            New project
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
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
      <NameDialog
        opened={renameTarget !== null}
        title="Rename project"
        label="Project name"
        submitLabel="Rename"
        initialValue={renameTarget?.name}
        busy={rename.isPending}
        error={rename.error ? errorMessage(rename.error) : undefined}
        onSubmit={renameProject}
        onClose={() => {
          setRenameTarget(null)
          rename.reset()
        }}
      />
    </>
  )
}
