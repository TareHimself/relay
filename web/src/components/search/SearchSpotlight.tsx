import { Group, Mark, Stack, Text, ThemeIcon } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { Spotlight } from '@mantine/spotlight'
import { IconFileText, IconFolder, IconMessage, IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { SearchHit, SearchKind } from '@shared/search'
import { useProjects, useSearch } from '../../api/queries'
import { docPath, projectPath } from '../../lib/paths'
import { splitSnippet } from '../../lib/snippet'
import { searchStore, selectFirstResult } from './searchStore'

const GROUPS: ReadonlyArray<{ kind: SearchKind; label: string }> = [
  { kind: 'page', label: 'Docs' },
  { kind: 'thread', label: 'Comments' },
  { kind: 'project', label: 'Projects' },
]
const ICONS = { page: IconFileText, thread: IconMessage, project: IconFolder } as const

function Snippet({ text }: { text: string }) {
  return (
    <>
      {splitSnippet(text).map((part, index) =>
        part.match ? (
          <Mark key={index} color="yellow">
            {part.text}
          </Mark>
        ) : (
          part.text
        ),
      )}
    </>
  )
}

export function SearchSpotlight() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced] = useDebouncedValue(query.trim(), 180)
  const search = useSearch(debounced)
  const projects = useProjects().data ?? []
  const results = search.data?.results
  const hits = useMemo(() => (debounced === '' ? [] : (results ?? [])), [debounced, results])
  useEffect(() => {
    if (hits.length === 0) return
    const timer = window.setTimeout(selectFirstResult, 0)
    return () => window.clearTimeout(timer)
  }, [hits])

  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? ''

  function open(hit: SearchHit) {
    if (hit.kind === 'project') void navigate(projectPath(hit.projectId))
    else if (hit.pageId) {
      const target = docPath(hit.projectId, hit.pageId)
      void navigate(hit.kind === 'thread' ? `${target}?thread=${hit.id}` : target)
    }
  }

  return (
    <Spotlight.Root
      store={searchStore}
      query={query}
      onQueryChange={setQuery}
      shortcut="mod + K"
      scrollable
      maxHeight={440}
      radius="md"
    >
      <Spotlight.Search
        placeholder="Search docs and comments…"
        aria-label="Search"
        leftSection={<IconSearch size={18} />}
      />
      <Spotlight.ActionsList>
        {debounced === '' && (
          <Spotlight.Empty>
            Search docs and comments. Add tag:name to filter by tag.
          </Spotlight.Empty>
        )}
        {debounced !== '' && !search.isFetching && hits.length === 0 && (
          <Spotlight.Empty>Nothing found</Spotlight.Empty>
        )}
        {GROUPS.map(({ kind, label }) => {
          const inGroup = hits.filter((hit) => hit.kind === kind)
          if (inGroup.length === 0) return null
          const Icon = ICONS[kind]
          return (
            <Spotlight.ActionsGroup key={kind} label={label}>
              {inGroup.map((hit) => (
                <Spotlight.Action key={`${hit.kind}:${hit.id}`} onClick={() => open(hit)}>
                  <Group wrap="nowrap" gap="sm" align="flex-start">
                    <ThemeIcon variant="light" color="gray" size="md" radius="md">
                      <Icon size={16} />
                    </ThemeIcon>
                    <Stack gap={2} miw={0}>
                      <Text size="sm" fw={600} truncate>
                        {hit.title}
                      </Text>
                      {hit.snippet && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          <Snippet text={hit.snippet} />
                        </Text>
                      )}
                      <Text size="xs" c="dimmed">
                        {projectName(hit.projectId)}
                      </Text>
                    </Stack>
                  </Group>
                </Spotlight.Action>
              ))}
            </Spotlight.ActionsGroup>
          )
        })}
      </Spotlight.ActionsList>
    </Spotlight.Root>
  )
}
