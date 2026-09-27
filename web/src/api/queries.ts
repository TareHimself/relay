import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { z } from 'zod'
import { pageSchema, pageSummarySchema, projectSchema } from '@shared/pages'
import type { PageInput, ProjectInput, ReplyInput, SaveInput, ThreadInput } from '@shared/requests'
import { searchHitSchema } from '@shared/search'
import { threadSchema, type Thread } from '@shared/threads'
import { personSchema, sessionRecordSchema, whoamiSchema } from '@shared/accounts'
import { createdTokenSchema, tokenRecordSchema, type TokenInput } from '@shared/tokens'
import { http } from './http'

const SAFETY_POLL_MS = 30_000

export const keys = {
  projects: ['projects'] as const,
  tokens: ['tokens'] as const,
  whoami: ['whoami'] as const,
  people: ['people'] as const,
  sessions: ['sessions'] as const,
  projectPages: (projectId: string) => ['projects', projectId, 'pages'] as const,
  page: (pageId: string) => ['pages', pageId] as const,
  threads: (pageId: string) => ['pages', pageId, 'threads'] as const,
  search: (query: string) => ['search', query] as const,
  history: (pageId: string) => ['pages', pageId, 'history'] as const,
  version: (pageId: string, hash: string) => ['pages', pageId, 'version', hash] as const,
}

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => http.get('/projects', z.array(projectSchema)),
  })
}

export function useProjectPages(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.projectPages(projectId ?? ''),
    queryFn: () => http.get(`/projects/${projectId}/pages`, z.array(pageSummarySchema)),
    enabled: projectId !== undefined,
  })
}

export function usePage(pageId: string | undefined) {
  return useQuery({
    queryKey: keys.page(pageId ?? ''),
    queryFn: () => http.get(`/pages/${pageId}`, pageSchema),
    enabled: pageId !== undefined,
    refetchInterval: SAFETY_POLL_MS,
  })
}

export function useThreads(pageId: string) {
  return useQuery({
    queryKey: keys.threads(pageId),
    queryFn: () => http.get(`/pages/${pageId}/threads`, z.array(threadSchema)),
    refetchInterval: SAFETY_POLL_MS,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) => http.post('/projects', projectSchema, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.projects }),
  })
}

export function useRenameProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      http.patch(`/projects/${input.id}`, projectSchema, { name: input.name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.projects }),
  })
}

export function useCreatePage(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PageInput) => http.post(`/projects/${projectId}/pages`, pageSchema, input),
    onSuccess: (page) => {
      queryClient.setQueryData(keys.page(page.id), page)
      return queryClient.invalidateQueries({ queryKey: keys.projectPages(projectId) })
    },
  })
}

const historyEntrySchema = z.object({
  hash: z.string(),
  author: z.string(),
  handle: z.string(),
  date: z.string(),
  subject: z.string(),
})
export type HistoryEntry = z.infer<typeof historyEntrySchema>

const versionSchema = z.object({ hash: z.string(), body: z.string() })

export function useHistory(pageId: string) {
  return useQuery({
    queryKey: keys.history(pageId),
    queryFn: () => http.get(`/pages/${pageId}/history`, z.array(historyEntrySchema)),
  })
}

export function useVersion(pageId: string, hash: string | null) {
  return useQuery({
    queryKey: keys.version(pageId, hash ?? ''),
    queryFn: () => http.get(`/pages/${pageId}/versions/${hash}`, versionSchema),
    enabled: hash !== null,
    staleTime: Infinity,
  })
}

export function useRestoreVersion(pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { hash: string; ifRevision: string }) =>
      http.post(`/pages/${pageId}/restore`, pageSchema, input),
    onSuccess: (page) => {
      queryClient.setQueryData(keys.page(pageId), page)
      void queryClient.invalidateQueries({ queryKey: keys.history(pageId) })
    },
  })
}

export function useSetTags(page: { id: string; projectId: string }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { tags: string[]; ifRevision: string }) =>
      http.put(`/pages/${page.id}/tags`, pageSchema, input),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.page(page.id), saved)
      void queryClient.invalidateQueries({ queryKey: keys.projectPages(page.projectId) })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

export function useSavePage(pageId: string) {
  return useMutation({
    mutationFn: (input: SaveInput) => http.put(`/pages/${pageId}`, pageSchema, input),
  })
}

export function useRenamePage(page: { id: string; projectId: string }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; ifRevision?: string }) =>
      http.patch(`/pages/${page.id}/title`, pageSchema, input),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.page(page.id), saved)
      void queryClient.invalidateQueries({ queryKey: keys.projectPages(page.projectId) })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

function useThreadMutation<TInput, TResult>(
  pageId: string,
  send: (input: TInput) => Promise<TResult>,
  applyResult?: (result: TResult, threads: Thread[]) => Thread[],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSuccess: (result) => {
      if (applyResult) {
        queryClient.setQueryData<Thread[]>(keys.threads(pageId), (current = []) =>
          applyResult(result, current),
        )
      }
      void queryClient.invalidateQueries({ queryKey: keys.threads(pageId) })
    },
  })
}

function upsertThread(thread: Thread, threads: Thread[]): Thread[] {
  return threads.some((t) => t.id === thread.id)
    ? threads.map((t) => (t.id === thread.id ? thread : t))
    : [...threads, thread]
}

export function useCreateThread(pageId: string) {
  return useThreadMutation(
    pageId,
    (input: ThreadInput) => http.post(`/pages/${pageId}/threads`, threadSchema, input),
    upsertThread,
  )
}

export function useReplyToThread(pageId: string) {
  return useThreadMutation(
    pageId,
    ({ threadId, ...input }: ReplyInput & { threadId: string }) =>
      http.post(`/threads/${threadId}/replies`, threadSchema, input),
    upsertThread,
  )
}

export function useEditMessage(pageId: string) {
  return useThreadMutation(
    pageId,
    ({ threadId, messageId, ...input }: ReplyInput & { threadId: string; messageId: string }) =>
      http.put(`/threads/${threadId}/messages/${messageId}`, threadSchema, input),
    upsertThread,
  )
}

export function useDeleteMessage(pageId: string) {
  return useThreadMutation(
    pageId,
    ({ threadId, messageId }: { threadId: string; messageId: string }) =>
      http.delete(
        `/threads/${threadId}/messages/${messageId}`,
        z.object({ threadRemoved: z.boolean() }),
      ),
  )
}

export function useReopenThread(pageId: string) {
  return useThreadMutation(
    pageId,
    (threadId: string) => http.post(`/threads/${threadId}/reopen`, threadSchema),
    upsertThread,
  )
}

export function useResolveThread(pageId: string) {
  return useThreadMutation(
    pageId,
    (threadId: string) => http.post(`/threads/${threadId}/resolve`, threadSchema),
    upsertThread,
  )
}

export function useTokens() {
  return useQuery({
    queryKey: keys.tokens,
    queryFn: () => http.get('/tokens', z.array(tokenRecordSchema)),
  })
}

export function useCreateToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TokenInput) => http.post('/tokens', createdTokenSchema, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.tokens }),
  })
}

export function useRevokeToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tokenId: string) =>
      http.delete(`/tokens/${tokenId}`, z.object({ ok: z.boolean() })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.tokens }),
  })
}

const okSchema = z.object({ ok: z.boolean() })

export function useWhoami() {
  return useQuery({
    queryKey: keys.whoami,
    queryFn: () => http.get('/whoami', whoamiSchema),
    retry: false,
    staleTime: 60_000,
  })
}

export function usePeople() {
  return useQuery({
    queryKey: keys.people,
    queryFn: () => http.get('/people', z.array(personSchema)),
    staleTime: 30_000,
  })
}

function removeAccountQueries(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.whoami[0] })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (password: string) => http.post('/login', whoamiSchema, { password }),
    onSuccess: (me) => {
      removeAccountQueries(queryClient)
      queryClient.setQueryData(keys.whoami, me)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => http.post('/logout', okSchema),
    onSuccess: () => {
      removeAccountQueries(queryClient)
      return queryClient.invalidateQueries({ queryKey: keys.whoami })
    },
  })
}

export function useRenameSelf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (displayName: string) => http.patch('/account', whoamiSchema, { displayName }),
    onSuccess: (me) => {
      queryClient.setQueryData(keys.whoami, me)
      return queryClient.invalidateQueries({ queryKey: keys.people })
    },
  })
}

export function useChangePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { current: string; next: string }) =>
      http.post('/account/password', okSchema, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sessions }),
  })
}

export function useSessions() {
  return useQuery({
    queryKey: keys.sessions,
    queryFn: () => http.get('/sessions', z.array(sessionRecordSchema)),
  })
}

export function useRevokeSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => http.delete(`/sessions/${sessionId}`, okSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sessions }),
  })
}

const searchResponseSchema = z.object({ results: z.array(searchHitSchema) })

export function useSearch(query: string) {
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => http.get(`/search?q=${encodeURIComponent(query)}`, searchResponseSchema),
    enabled: query.trim() !== '',
    placeholderData: keepPreviousData,
    staleTime: 5000,
  })
}

export function useDeletePage(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { pageId: string; ifRevision: string }) =>
      http.delete(
        `/pages/${input.pageId}?ifRevision=${encodeURIComponent(input.ifRevision)}`,
        okSchema,
      ),
    onSuccess: (_result, input) => {
      queryClient.removeQueries({ queryKey: keys.page(input.pageId) })
      void queryClient.invalidateQueries({ queryKey: keys.projectPages(projectId) })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}
