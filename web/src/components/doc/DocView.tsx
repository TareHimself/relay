import type { CodeMirrorMarkdownEditorProps } from '@latentic/live-markdown'
import { styled } from '@linaria/react'
import { Stack } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { EditorView } from '@codemirror/view'
import { useSearchParams } from 'react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveAnchor } from '@shared/anchors'
import type { Page } from '@shared/pages'
import type { Thread } from '@shared/threads'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, errorMessage } from '../../api/http'
import {
  keys,
  useCreateThread,
  useDeleteMessage,
  useEditMessage,
  useRenamePage,
  useReopenThread,
  useReplyToThread,
  useResolveThread,
  useThreads,
} from '../../api/queries'
import { DRAFT_ID, commentsExtension, markRanges } from '../../editor/commentsExtension'
import { codeBlockCopy } from '../../editor/codeBlockCopy'
import { codeBlockExitKeys } from '../../editor/codeBlockExit'
import { DocEditor } from '../../editor/DocEditor'
import { headingPlaceholder } from '../../editor/headingPlaceholder'
import { linkDraftFromSelection } from '../../editor/link'
import { headingShortcut } from '../../editor/headingShortcut'
import { SelectionBar } from '../../editor/SelectionBar'
import { draftFromSelection } from '../../editor/selectionDraft'
import { useCommentLayout } from '../../editor/useCommentLayout'
import { noWritingAssistant } from '../../editor/writingAssistants'
import { useDocSync } from '../../editor/useDocSync'
import { useEditorBridge } from '../../editor/useEditorBridge'
import { useGutterRoom } from '../../editor/useGutterRoom'
import { useOutline } from '../../editor/useOutline'
import { useOutlineStore } from '../../stores/outlineStore'
import { usePrefsStore } from '../../stores/prefsStore'
import { useUiStore } from '../../stores/uiStore'
import { AnchoredStack, type AnchoredItem } from '../comments/AnchoredStack'
import { DraftCard } from '../comments/DraftCard'
import { PageComments } from '../comments/PageComments'
import { ThreadCard } from '../comments/ThreadCard'
import { NameDialog } from '../common/NameDialog'
import { ConflictBanner } from './ConflictBanner'
import { DeleteDocDialog } from './DeleteDocDialog'
import { DocActions, DocTitle } from './DocHeader'
import { DocTags } from './DocTags'
import { LinkDialog } from './LinkDialog'
import { VersionsDrawer } from './VersionsDrawer'
import { GUTTER_GAP, GUTTER_WIDTH, OutlineGutter } from './OutlineGutter'

const NO_THREADS: Thread[] = []

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  width: 100%;
  max-width: 1392px;
  margin: 0 auto;

  &[data-width='full'] {
    max-width: none;
  }
`

const Columns = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  column-gap: 32px;
  row-gap: 20px;
  align-items: start;

  &[data-wide='false'] {
    grid-template-columns: minmax(0, 1fr);
  }
`

const Sheet = styled.article`
  min-height: 70vh;
  padding: 40px 56px 96px;
  border: 1px solid var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-md);
  background: var(--mantine-color-body);
  box-shadow: var(--mantine-shadow-xs);

  @media (max-width: 62em) {
    padding: 24px 20px 64px;
  }
`

type SelectionActions = NonNullable<CodeMirrorMarkdownEditorProps['selectionActions']>

interface DocViewProps {
  page: Page
  projectName: string | undefined
}

export function DocView({ page, projectName }: DocViewProps) {
  const sync = useDocSync(page)
  const { bridge, view, tick } = useEditorBridge((threadId) =>
    useUiStore.getState().setActiveThread(threadId),
  )
  useOutline(view, tick)
  const queryClient = useQueryClient()
  const frame = useRef<HTMLDivElement>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const renamePage = useRenamePage(page)
  const [params, setParams] = useSearchParams()
  const targetThread = params.get('thread')
  const gutterRoom = useGutterRoom(frame, GUTTER_WIDTH + GUTTER_GAP + 8)
  useEffect(() => {
    useOutlineStore.getState().setGutter(gutterRoom)
  }, [gutterRoom])
  const extensions = useMemo(
    () => [
      commentsExtension(bridge),
      noWritingAssistant,
      headingShortcut,
      headingPlaceholder,
      codeBlockExitKeys,
      codeBlockCopy,
    ],
    [bridge],
  )
  const wide = useMediaQuery('(min-width: 62em)') ?? true
  const columns = useRef<HTMLDivElement>(null)

  const threads = useThreads(page.id).data ?? NO_THREADS
  const createThread = useCreateThread(page.id)
  const reply = useReplyToThread(page.id)
  const editMessage = useEditMessage(page.id)
  const resolve = useResolveThread(page.id)
  const reopen = useReopenThread(page.id)
  const deleteMessage = useDeleteMessage(page.id)

  const activeId = useUiStore((state) => state.activeThreadId)
  const hoveredId = useUiStore((state) => state.hoveredThreadId)
  const filter = useUiStore((state) => state.filter)
  const pageWidth = usePrefsStore((state) => state.pageWidth)
  const togglePageWidth = usePrefsStore((state) => state.togglePageWidth)
  const draft = useUiStore((state) => state.draft)
  const pageDraftOpen = useUiStore((state) => state.pageDraftOpen)
  const setActiveThread = useUiStore((state) => state.setActiveThread)
  const setHoveredThread = useUiStore((state) => state.setHoveredThread)
  const setFilter = useUiStore((state) => state.setFilter)
  const startDraft = useUiStore((state) => state.startDraft)
  const startPageDraft = useUiStore((state) => state.startPageDraft)
  const cancelDraft = useUiStore((state) => state.cancelDraft)
  const completeDraft = useUiStore((state) => state.completeDraft)
  const reset = useUiStore((state) => state.reset)

  useEffect(() => {
    reset()
    return reset
  }, [page.id, reset])

  const visible = useMemo(
    () => threads.filter((thread) => (thread.status === 'resolved') === (filter === 'resolved')),
    [threads, filter],
  )
  const resolvedCount = threads.filter((thread) => thread.status === 'resolved').length
  const layout = useCommentLayout({
    view,
    container: columns,
    threads: visible,
    activeId,
    hoveredId,
    draft,
    tick,
  })

  useEffect(() => {
    if (!targetThread || !view || !layout.settled) return
    const thread = threads.find((candidate) => candidate.id === targetThread)
    if (!thread) return
    const wanted = thread.status === 'resolved' ? 'resolved' : 'open'
    if (filter !== wanted) {
      setFilter(wanted)
      return
    }
    setActiveThread(thread.id)
    const range = markRanges(view.state).get(thread.id)
    if (range) view.dispatch({ effects: EditorView.scrollIntoView(range.from, { y: 'center' }) })
    setParams(
      (previous) => {
        previous.delete('thread')
        return previous
      },
      { replace: true },
    )
  }, [targetThread, view, threads, layout.settled, filter, setFilter, setActiveThread, setParams])

  async function submitAnchored(body: string) {
    const submitted = draft
    if (!submitted) return
    await sync.ensureSaved()
    try {
      await createThread.mutateAsync({
        body,
        anchorText: submitted.exact,
        context: { prefix: submitted.prefix, suffix: submitted.suffix },
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        throw new Error('That selection could not be anchored. Try selecting a different span.', {
          cause: error,
        })
      throw error
    }
    completeDraft(submitted)
  }

  async function submitPageComment(body: string) {
    await createThread.mutateAsync({ body })
    completeDraft(null)
  }

  async function submitRename(title: string) {
    await sync.ensureSaved()
    const latest = queryClient.getQueryData<Page>(keys.page(page.id)) ?? page
    try {
      await renamePage.mutateAsync({ title, ifRevision: latest.revision })
      setRenameOpen(false)
      renamePage.reset()
    } catch {
      return
    }
  }

  const card = (thread: Thread) => (
    <ThreadCard
      key={thread.id}
      thread={thread}
      active={thread.id === activeId}
      onActivate={() => setActiveThread(thread.id)}
      onHover={(hovering) => setHoveredThread(hovering ? thread.id : null)}
      onReply={async (body) => {
        await reply.mutateAsync({ threadId: thread.id, body })
      }}
      onEdit={async (messageId, body) => {
        await editMessage.mutateAsync({ threadId: thread.id, messageId, body })
      }}
      onDelete={(messageId) => {
        const removesThread = thread.messages[0]?.id === messageId && thread.messages.length > 1
        if (removesThread && !window.confirm('Delete this comment and all its replies?')) return
        void deleteMessage.mutateAsync({ threadId: thread.id, messageId })
      }}
      onResolve={() => void resolve.mutateAsync(thread.id)}
      onReopen={() => void reopen.mutateAsync(thread.id)}
    />
  )

  const draftInMargin =
    draft !== null &&
    view !== null &&
    resolveAnchor(view.state.doc.toString(), draft, draft.from) !== null
  const items: AnchoredItem[] = (layout.settled ? layout.placed : []).map(({ thread, top }) => ({
    id: thread.id,
    top,
    children: card(thread),
  }))
  if (draft && draftInMargin) {
    items.push({
      id: DRAFT_ID,
      top: layout.draftTop ?? 0,
      children: (
        <div style={{ opacity: layout.draftTop === null ? 0 : 1 }}>
          <DraftCard
            key={`${draft.from}:${draft.exact}`}
            quote={draft.exact}
            onSubmit={submitAnchored}
            onCancel={cancelDraft}
          />
        </div>
      ),
    })
  }

  const pageDraft =
    pageDraftOpen || (draft && !draftInMargin) ? (
      <DraftCard
        key={draft ? `${draft.from}:${draft.exact}` : 'page'}
        quote={draft?.exact}
        onSubmit={draft ? submitAnchored : submitPageComment}
        onCancel={cancelDraft}
      />
    ) : null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'm')
        return
      const next = view ? draftFromSelection(view) : null
      if (!next) return
      event.preventDefault()
      startDraft(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, startDraft])

  const openLink = useCallback(() => {
    if (view) useUiStore.getState().openLink(linkDraftFromSelection(view.state))
  }, [view])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'k')
        return
      if (!view?.hasFocus) return
      event.preventDefault()
      openLink()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, openLink])

  const selectionActions = useCallback<SelectionActions>(
    ({ selection }) =>
      selection && view ? (
        <SelectionBar view={view} onComment={startDraft} onLink={openLink} />
      ) : null,
    [view, startDraft, openLink],
  )

  return (
    <Frame ref={frame} data-width={pageWidth}>
      {gutterRoom && <OutlineGutter />}
      <LinkDialog view={view} />
      <DeleteDocDialog
        page={page}
        commentCount={threads.length}
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        beforeDelete={sync.ensureSaved}
      />
      <VersionsDrawer
        page={page}
        opened={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        beforeRestore={sync.ensureSaved}
      />
      <NameDialog
        opened={renameOpen}
        title="Rename doc"
        label="Title"
        submitLabel="Rename"
        initialValue={page.title}
        busy={renamePage.isPending}
        error={renamePage.error ? errorMessage(renamePage.error) : undefined}
        onSubmit={(title) => void submitRename(title)}
        onClose={() => {
          setRenameOpen(false)
          renamePage.reset()
        }}
      />
      <DocActions
        pageWidth={pageWidth}
        onToggleWidth={togglePageWidth}
        onOpenVersions={() => setVersionsOpen(true)}
        onRename={() => setRenameOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        status={sync.status}
        resolvedCount={resolvedCount}
        filter={filter}
        onFilterChange={setFilter}
        onRetry={sync.retry}
      />
      {sync.status === 'conflict' && (
        <ConflictBanner onLoadLatest={sync.loadLatest} onKeepMine={sync.keepMine} />
      )}
      <Columns ref={columns} data-wide={wide}>
        <Sheet>
          <Stack gap="lg">
            <div>
              <DocTitle projectName={projectName} title={page.title} />
              <DocTags page={page} beforeChange={sync.ensureSaved} />
            </div>
            <DocEditor
              key={`${page.id}:${sync.editorKey}`}
              body={sync.body}
              extensions={extensions}
              onChange={sync.onChange}
              onFlushReady={sync.onFlushReady}
              selectionActions={selectionActions}
            />
          </Stack>
        </Sheet>
        <AnchoredStack items={items} wide={wide} />
        <div style={wide ? { gridColumn: 1, gridRow: 2 } : undefined}>
          <PageComments
            onStart={startPageDraft}
            draft={pageDraft}
            cards={[
              ...visible.filter((thread) => !thread.anchor),
              ...(layout.settled ? layout.unplaced : []),
            ].map((thread) => ({ id: thread.id, node: card(thread) }))}
          />
        </div>
      </Columns>
    </Frame>
  )
}
