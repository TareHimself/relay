import { styled } from '@linaria/react'
import { css } from '@linaria/core'
import { ActionIcon, Box, Group, Kbd, NavLink, Skeleton, Stack, Text, Tooltip } from '@mantine/core'
import { IconLayoutSidebarLeftCollapse, IconSearch, IconSettings } from '@tabler/icons-react'
import { searchSpotlight } from '../search/searchStore'
import { useNavigate } from 'react-router'
import type { Project } from '@shared/pages'
import { useProjectPages } from '../../api/queries'
import { DocList } from './DocList'
import { useOutlineStore } from '../../stores/outlineStore'
import { DocOutline } from './DocOutline'
import { ProjectSwitcher } from './ProjectSwitcher'
import { UserFooter } from './UserFooter'

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 12px;
  background: var(--mantine-color-default-hover);
`

const footerLink = css`
  flex: none;
  border-radius: var(--mantine-radius-md);
`

interface SidebarProps {
  projects: Project[]
  loading: boolean
  project: Project | undefined
  activeDocId: string | undefined
  homeActive: boolean
  settingsActive: boolean
  onCollapse: () => void
}

export function Sidebar({
  projects,
  loading,
  project,
  activeDocId,
  homeActive,
  settingsActive,
  onCollapse,
}: SidebarProps) {
  const pages = useProjectPages(project?.id)
  const outlineInGutter = useOutlineStore((state) => state.gutter)
  const navigate = useNavigate()
  return (
    <Column>
      <Group gap={4} wrap="nowrap">
        <Box flex={1} miw={0}>
          <ProjectSwitcher projects={projects} current={project} loading={loading} />
        </Box>
        <Tooltip label="Collapse sidebar (Ctrl+\)" openDelay={300}>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Collapse sidebar"
            onClick={onCollapse}
          >
            <IconLayoutSidebarLeftCollapse size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <NavLink
        label="Search"
        leftSection={<IconSearch size={16} />}
        rightSection={<Kbd size="xs">Ctrl K</Kbd>}
        variant="light"
        className={footerLink}
        onClick={() => searchSpotlight.open()}
      />
      {project ? (
        <>
          <DocList
            projectId={project.id}
            pages={pages.data ?? []}
            loading={pages.isPending}
            activeDocId={activeDocId}
            homeActive={homeActive}
          />
          {activeDocId && !outlineInGutter && <DocOutline />}
          <Box flex={1} />
        </>
      ) : (
        <Box flex={1}>
          {loading ? (
            <Stack gap={6} px="xs" mt="xs">
              <Skeleton height={14} width={48} />
              <Skeleton height={34} />
              <Skeleton height={34} />
            </Stack>
          ) : (
            <Text size="sm" c="dimmed" px="xs">
              Projects hold your docs. Use the switcher above to create one.
            </Text>
          )}
        </Box>
      )}
      <NavLink
        label="Settings"
        leftSection={<IconSettings size={16} />}
        active={settingsActive}
        variant="light"
        className={footerLink}
        onClick={() => void navigate('/settings')}
      />
      <UserFooter />
    </Column>
  )
}
