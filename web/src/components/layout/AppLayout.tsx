import { ActionIcon, AppShell, Burger, Group, Loader, Title, Tooltip } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { css } from '@linaria/core'
import { IconLayoutSidebarLeftExpand } from '@tabler/icons-react'
import { useEffect } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router'
import { errorMessage } from '../../api/http'
import { useLiveUpdates } from '../../api/liveUpdates'
import { usePeople, useProjects } from '../../api/queries'
import { usePrefsStore } from '../../stores/prefsStore'
import { ErrorNotice } from '../common/ErrorNotice'
import { SearchSpotlight } from '../search/SearchSpotlight'
import { Sidebar } from './Sidebar'

const surround = css`
  background: var(--relay-surround);
`
const reopen = css`
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 150;
`

export function AppLayout() {
  useLiveUpdates()
  const projects = useProjects()
  const people = usePeople()
  const [navOpen, { toggle, close }] = useDisclosure()
  const location = useLocation()
  const projectMatch = useMatch('/projects/:projectId/*')
  const docMatch = useMatch('/projects/:projectId/docs/:docId')
  const homeMatch = useMatch('/projects/:projectId')
  const collapsed = usePrefsStore((state) => state.sidebarCollapsed)
  const toggleSidebar = usePrefsStore((state) => state.toggleSidebar)
  const lastProjectId = usePrefsStore((state) => state.lastProjectId)
  const setLastProject = usePrefsStore((state) => state.setLastProject)
  const settingsMatch = useMatch('/settings')
  const routeProjectId = projectMatch?.params.projectId

  useEffect(close, [location.pathname, close])

  useEffect(() => {
    if (routeProjectId) setLastProject(routeProjectId)
  }, [routeProjectId, setLastProject])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const list = projects.data ?? []
  const ready = !projects.isPending && !people.isPending
  const project = list.find((p) => p.id === (routeProjectId ?? lastProjectId))

  return (
    <>
      <SearchSpotlight />
      <AppShell
        header={{ height: { base: 52, sm: 0 } }}
        navbar={{
          width: 272,
          breakpoint: 'sm',
          collapsed: { mobile: !navOpen, desktop: collapsed },
        }}
        padding="lg"
      >
        <AppShell.Header hiddenFrom="sm">
          <Group h="100%" px="md">
            <Burger opened={navOpen} onClick={toggle} size="sm" aria-label="Toggle navigation" />
            <Title order={4}>{project?.name ?? 'relay'}</Title>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar>
          <Sidebar
            projects={list}
            loading={projects.isPending}
            project={project}
            activeDocId={docMatch?.params.docId}
            homeActive={homeMatch !== null}
            settingsActive={settingsMatch !== null}
            onCollapse={toggleSidebar}
          />
        </AppShell.Navbar>
        <AppShell.Main className={surround}>
          {collapsed && (
            <Tooltip label="Show sidebar (Ctrl+\)" openDelay={300}>
              <ActionIcon
                className={reopen}
                variant="default"
                visibleFrom="sm"
                aria-label="Show sidebar"
                onClick={toggleSidebar}
              >
                <IconLayoutSidebarLeftExpand size={18} />
              </ActionIcon>
            </Tooltip>
          )}
          <div>
            {projects.error && <ErrorNotice message={errorMessage(projects.error)} />}
            {ready ? <Outlet /> : <Loader size="sm" />}
          </div>
        </AppShell.Main>
      </AppShell>
    </>
  )
}
