import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { StoreError } from '../core/errors'
import type { Page } from '../shared/pages'
import {
  editInput,
  projectDescriptionInput,
  projectInput,
  renamePageInput,
  renameProjectInput,
  threadInput,
} from '../shared/requests'
import { threadStatusSchema } from '../shared/threads'
import { MARKDOWN_SUPPORT } from '../shared/markdownSupport'
import { MARK_END, MARK_START } from '../store/search'
import { pageMetadata, type Workspace } from '../workspace'

function result(value: unknown, isError = false): CallToolResult {
  const content = [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
  return isError ? { content, isError: true } : { content }
}

async function respond(work: () => unknown): Promise<CallToolResult> {
  try {
    return result(await work())
  } catch (error) {
    if (error instanceof StoreError) {
      return result({ error: error.code, message: error.message, details: error.details }, true)
    }
    console.error(error)
    return result({ error: 'internal', message: 'Internal server error' }, true)
  }
}

const includeBodyFlag = z
  .boolean()
  .optional()
  .describe('Return the full page including body. By default only metadata is returned.')

function pageResult(page: Page, withBody: boolean | undefined) {
  return withBody ? page : pageMetadata(page)
}

export function createMcpServer(workspace: Workspace): McpServer {
  const server = new McpServer(
    { name: 'relay', version: '0.1.0' },
    { instructions: workspace.agentInstructions() },
  )

  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Return the name, scope and project restriction of the token in use.',
    },
    () => respond(() => workspace.whoami()),
  )

  server.registerTool(
    'markdown_support',
    {
      title: 'Markdown support',
      description:
        'List the markdown features pages can use (tables, mermaid, math, images and more) and what is not supported. Call this before asking whether something renders.',
    },
    () => result(MARKDOWN_SUPPORT),
  )

  server.registerTool(
    'list_projects',
    { title: 'List projects', description: 'List the projects you can access.' },
    () => respond(() => workspace.listProjects()),
  )

  server.registerTool(
    'create_project',
    {
      title: 'Create project',
      description:
        'Create a project to hold pages. Needs a write token that is not project-restricted.',
      inputSchema: projectInput.shape,
    },
    ({ name, description }) => respond(() => workspace.createProject(name, description ?? '')),
  )

  server.registerTool(
    'rename_project',
    {
      title: 'Rename project',
      description: "Change a project's display name.",
      inputSchema: { id: z.string(), ...renameProjectInput.shape },
    },
    ({ id, name }) => respond(() => workspace.renameProject(id, name)),
  )

  server.registerTool(
    'set_project_description',
    {
      title: 'Set project description',
      description: "Change a project's description.",
      inputSchema: { id: z.string(), ...projectDescriptionInput.shape },
    },
    ({ id, description }) => respond(() => workspace.setProjectDescription(id, description)),
  )

  server.registerTool(
    'list_pages',
    {
      title: 'List pages',
      description: 'List the pages in a project (id, title, url, revision, tags, preview).',
      inputSchema: { projectId: z.string() },
    },
    ({ projectId }) => respond(() => workspace.listPages(projectId)),
  )

  server.registerTool(
    'read_page',
    {
      title: 'Read page',
      description:
        'Read a page: metadata (title, tags, revision, url), body (plain markdown, no ' +
        'frontmatter) and outline (each heading as { text, level, id }; use the text as an ' +
        'edit_page section). Pass sinceRevision (from an earlier read) to get { unchanged: true } ' +
        'instead of the full page when nothing changed. Pass includeBody: false to get only ' +
        'metadata and outline.',
      inputSchema: {
        id: z.string(),
        sinceRevision: z.string().optional(),
        includeBody: z.boolean().optional(),
      },
    },
    ({ id, sinceRevision, includeBody }) =>
      respond(() => workspace.readPage(id, { sinceRevision, includeBody })),
  )

  server.registerTool(
    'create_page',
    {
      title: 'Create page',
      description:
        'Create a new page in a project. Returns the page metadata (id, url, revision, ' +
        'updatedAt, tags); pass includeBody to get the body back too. The markdown body and tags ' +
        'are optional. Send only the markdown body: frontmatter in it is rejected.',
      inputSchema: {
        projectId: z.string(),
        title: z.string().min(1),
        body: z
          .string({
            error:
              'body is required. It was renamed from "markdown": if your tool list still says markdown, it is outdated, so reload the relay MCP tools or start a new session.',
          })
          .describe('The page body as plain markdown, no frontmatter. Use "" for an empty page.'),
        tags: z.array(z.string()).optional(),
        includeBody: includeBodyFlag,
      },
    },
    ({ projectId, title, body, tags, includeBody: withBody }) =>
      respond(async () =>
        pageResult(await workspace.createPage(projectId, title, body, tags), withBody),
      ),
  )

  server.registerTool(
    'set_tags',
    {
      title: 'Set tags',
      description:
        "Replace a page's tags. Tags are lowercase words; use a/b for nesting (a search for " +
        'tag:a also finds a/b). Pass ifRevision from your last read to refuse the change if the ' +
        'page changed.',
      inputSchema: {
        id: z.string(),
        tags: z.array(z.string()),
        ifRevision: z.string().optional(),
        includeBody: includeBodyFlag,
      },
    },
    ({ id, tags, ifRevision, includeBody: withBody }) =>
      respond(async () => pageResult(await workspace.setTags(id, tags, ifRevision), withBody)),
  )

  server.registerTool(
    'rename_page',
    {
      title: 'Rename page',
      description:
        "Change a page's title. Its id, history and comment threads stay. Pass ifRevision from " +
        'your last read to refuse the change if the page changed. Returns the page metadata; pass ' +
        'includeBody to get the body back too.',
      inputSchema: {
        id: z.string(),
        ...renamePageInput.shape,
        includeBody: includeBodyFlag,
      },
    },
    ({ id, title, ifRevision, includeBody: withBody }) =>
      respond(async () => pageResult(await workspace.renamePage(id, title, ifRevision), withBody)),
  )

  server.registerTool(
    'list_tags',
    {
      title: 'List tags',
      description:
        'List the tags in use with how many pages carry each, optionally for one project.',
      inputSchema: { projectId: z.string().optional() },
    },
    ({ projectId }) => respond(() => workspace.listTags(projectId)),
  )

  server.registerTool(
    'edit_page',
    {
      title: 'Edit page',
      description:
        'Change a page. Pass one of: edits, or body (replaces the whole body and keeps the page ' +
        'id, history and comment threads). Each edit is either { find, replace } (find must occur ' +
        'exactly once in the body) or { section, replace } (replaces the body under that heading ' +
        'up to the next heading of the same or higher level; the heading itself stays). Only the ' +
        'markdown body is edited: frontmatter in it is rejected. Pass ifRevision from your last ' +
        'read to refuse the change if the page changed. Returns the page metadata (id, url, ' +
        'revision, updatedAt, tags); pass includeBody to get the body back too. Conflicts return ' +
        'the current page in details.current so you can re-read and retry.',
      inputSchema: { id: z.string(), ...editInput.shape, includeBody: includeBodyFlag },
    },
    ({ id, edits, body, ifRevision, includeBody: withBody }) =>
      respond(async () =>
        pageResult(await workspace.editPage(id, { edits, body }, ifRevision), withBody),
      ),
  )

  server.registerTool(
    'read_threads',
    {
      title: 'Read threads',
      description: 'List every comment thread on a page, including resolved ones.',
      inputSchema: { pageId: z.string() },
    },
    ({ pageId }) => respond(() => workspace.listPageThreads(pageId)),
  )

  server.registerTool(
    'open_threads',
    {
      title: 'Open threads',
      description:
        "List comment threads that need attention (status defaults to 'open'). Pass to with your own " +
        'name to see only threads addressed to you, and projectId to narrow to one project.',
      inputSchema: {
        to: z.string().optional(),
        projectId: z.string().optional(),
        status: threadStatusSchema.optional(),
      },
    },
    ({ to, projectId, status }) => respond(() => workspace.listThreads({ to, projectId, status })),
  )

  server.registerTool(
    'reply',
    {
      title: 'Reply',
      description:
        'Reply to a comment thread. A reply from an addressed agent marks the thread answered.',
      inputSchema: { threadId: z.string(), body: z.string().min(1) },
    },
    ({ threadId, body }) => respond(() => workspace.reply(threadId, body)),
  )

  server.registerTool(
    'resolve',
    {
      title: 'Resolve thread',
      description: 'Mark a comment thread resolved.',
      inputSchema: { threadId: z.string() },
    },
    ({ threadId }) => respond(() => workspace.resolve(threadId)),
  )

  server.registerTool(
    'comment',
    {
      title: 'Comment',
      description:
        'Start a comment thread. With anchorText (text that appears in the page) the thread is ' +
        'attached to that text; without it, it is a page-level comment. Write @name in the body, or ' +
        'pass to, to address someone.',
      inputSchema: { pageId: z.string(), ...threadInput.shape },
    },
    ({ pageId, body, anchorText, context, to }) =>
      respond(() =>
        workspace.createThread(pageId, body, {
          ...(anchorText === undefined ? {} : { anchorText }),
          ...(context === undefined ? {} : { context }),
          ...(to === undefined ? {} : { to }),
        }),
      ),
  )

  server.registerTool(
    'history',
    {
      title: 'History',
      description:
        "List a page's versions, newest first: id, kind (create, edit, rename, tags, restore), " +
        'actor, summary, createdAt and updatedAt. Saves by one person within a few minutes are ' +
        'one version. Page with limit and offset.',
      inputSchema: {
        id: z.string(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    ({ id, limit, offset }) => respond(() => workspace.history(id, { limit, offset })),
  )

  server.registerTool(
    'diff',
    {
      title: 'Diff',
      description:
        'Show the unified diff of a page between two versions from its history, by version id. ' +
        "'to' defaults to the current text.",
      inputSchema: { id: z.string(), from: z.string(), to: z.string().optional() },
    },
    ({ id, from, to }) => respond(() => workspace.diff(id, from, to)),
  )

  server.registerTool(
    'delete_page',
    {
      title: 'Delete page',
      description:
        'Delete a page and its comment threads. The page and its history are kept so an ' +
        'administrator can recover it. Pass ifRevision from your last read to refuse the ' +
        'delete if the page changed since.',
      inputSchema: { id: z.string(), ifRevision: z.string().optional() },
    },
    ({ id, ifRevision }) =>
      respond(async () => {
        await workspace.deletePage(id, ifRevision)
        return { deleted: true }
      }),
  )

  server.registerTool(
    'search',
    {
      title: 'Search',
      description:
        'Full-text search across pages, comment threads and projects you can access. Words are ' +
        'matched as prefixes, so "fibe" finds "fiber". Add tag:name to limit to tagged pages ' +
        '(alone, it lists them). Matches in the snippet are wrapped in [ ]. ' +
        'Narrow with projectId or kinds (page, thread, project).',
      inputSchema: {
        query: z.string(),
        projectId: z.string().optional(),
        kinds: z.array(z.enum(['page', 'thread', 'project'])).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    ({ query, projectId, kinds, limit }) =>
      respond(() =>
        workspace.search(query, { projectId, kinds, limit }).map((hit) => ({
          ...hit,
          snippet: hit.snippet.replaceAll(MARK_START, '[').replaceAll(MARK_END, ']'),
        })),
      ),
  )

  server.registerTool(
    'read_version',
    {
      title: 'Read version',
      description:
        'Read a page as it was at a version from its history (title, tags and plain markdown body).',
      inputSchema: { id: z.string(), versionId: z.string() },
    },
    ({ id, versionId }) => respond(() => workspace.version(id, versionId)),
  )

  server.registerTool(
    'restore_version',
    {
      title: 'Restore version',
      description:
        'Restore a page to an earlier version from its history. The current text is kept as a ' +
        'version, so nothing is lost. Pass ifRevision from your last read; the restore is ' +
        'refused if the page changed since.',
      inputSchema: { id: z.string(), versionId: z.string(), ifRevision: z.string() },
    },
    ({ id, versionId, ifRevision }) => respond(() => workspace.restore(id, versionId, ifRevision)),
  )

  server.registerTool(
    'poll_events',
    {
      title: 'Poll events',
      description:
        'Return events after since (an event id or an ISO timestamp), oldest first, plus a next ' +
        'cursor to pass as since next time. Filter with types, projectId, and excludeActor (pass ' +
        'your own name to skip your own changes).',
      inputSchema: {
        since: z.string().optional(),
        types: z.array(z.string()).optional(),
        projectId: z.string().optional(),
        excludeActor: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    (query) => respond(() => workspace.events(query)),
  )

  return server
}
