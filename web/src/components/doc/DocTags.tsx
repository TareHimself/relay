import { TagsInput, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Page } from '@shared/pages'
import { normalizeTags } from '@shared/tags'
import { errorMessage } from '../../api/http'
import { keys, useProjectPages, useSetTags } from '../../api/queries'

interface DocTagsProps {
  page: Page
  beforeChange: () => Promise<void>
}

export function DocTags({ page, beforeChange }: DocTagsProps) {
  const queryClient = useQueryClient()
  const setTags = useSetTags(page)
  const siblings = useProjectPages(page.projectId).data
  const [pending, setPending] = useState<string[] | null>(null)
  const suggestions = useMemo(
    () => [...new Set((siblings ?? []).flatMap((sibling) => sibling.tags))].sort(),
    [siblings],
  )

  async function change(next: string[]) {
    const tags = normalizeTags(next)
    setPending(tags)
    try {
      await beforeChange()
      const latest = queryClient.getQueryData<Page>(keys.page(page.id)) ?? page
      await setTags.mutateAsync({ tags, ifRevision: latest.revision })
    } catch {
      return
    } finally {
      setPending(null)
    }
  }

  return (
    <div style={{ paddingInlineStart: 6 }}>
      <TagsInput
        aria-label="Tags"
        variant="unstyled"
        size="sm"
        placeholder={page.tags.length === 0 && pending === null ? 'Add tags' : ''}
        value={pending ?? page.tags}
        data={suggestions}
        splitChars={[',']}
        acceptValueOnBlur
        clearable={false}
        onChange={(next) => void change(next)}
      />
      {setTags.error && (
        <Text size="xs" c="red">
          {errorMessage(setTags.error)}
        </Text>
      )}
    </div>
  )
}
