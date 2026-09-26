import { StoreError } from '../core/errors'
import { AUTOSAVE_IDLE_SECONDS, AUTOSAVE_MAX_SECONDS, type Git } from './git'

export interface CommitRecord {
  hash: string
  parents: string[]
  tree: string
  authorName: string
  authorEmail: string
  authorDate: string
  committerName: string
  committerEmail: string
  committerDate: string
  message: string
  files: string[]
}

const EDIT_SUBJECT = /^edit: (.+) \(([^)]+)\)$/

function subjectOf(commit: CommitRecord): string {
  return commit.message.split('\n')[0] ?? ''
}

function seconds(rawDate: string): number {
  return Number(rawDate.split(' ')[0])
}

function isAutosave(commit: CommitRecord, humans: ReadonlySet<string>): boolean {
  const match = EDIT_SUBJECT.exec(subjectOf(commit))
  return (
    match !== null &&
    commit.files.length === 1 &&
    commit.files[0] === match[1] &&
    humans.has(match[2] ?? '')
  )
}

export function planTidy(
  commits: readonly CommitRecord[],
  humans: ReadonlySet<string>,
  limits = { idle: AUTOSAVE_IDLE_SECONDS, max: AUTOSAVE_MAX_SECONDS },
): number[][] {
  const groups: number[][] = []
  let current: number[] = []
  commits.forEach((commit, index) => {
    const first = commits[current[0] ?? -1]
    const previous = commits[current.at(-1) ?? -1]
    const joins =
      first !== undefined &&
      previous !== undefined &&
      isAutosave(first, humans) &&
      isAutosave(commit, humans) &&
      commit.authorEmail === first.authorEmail &&
      commit.files[0] === first.files[0] &&
      seconds(commit.committerDate) - seconds(previous.committerDate) <= limits.idle &&
      seconds(commit.committerDate) - seconds(first.authorDate) <= limits.max
    if (joins) {
      current.push(index)
    } else {
      if (current.length > 0) groups.push(current)
      current = [index]
    }
  })
  if (current.length > 0) groups.push(current)
  return groups
}

export function mergedMessage(group: readonly CommitRecord[]): string {
  const [first, ...rest] = group
  if (!first) return ''
  const extra = rest.flatMap((commit) =>
    commit.message.split('\n').filter((line) => line.startsWith('Operation-ID: ')),
  )
  return [first.message.trimEnd(), ...extra].join('\n')
}

export interface TidySummary {
  before: number
  after: number
  merged: number
  applied: boolean
  backupRef?: string
}

function parseLog(raw: string): CommitRecord[] {
  return raw
    .split('\x1e')
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const parts = record.split('\0')
      const [hash, parents, tree, an, ae, ad, cn, ce, cd, message, files] = parts
      return {
        hash: (hash ?? '').trim(),
        parents: (parents ?? '').split(' ').filter(Boolean),
        tree: tree ?? '',
        authorName: an ?? '',
        authorEmail: ae ?? '',
        authorDate: ad ?? '',
        committerName: cn ?? '',
        committerEmail: ce ?? '',
        committerDate: cd ?? '',
        message: message ?? '',
        files: (files ?? '').split('\n').filter(Boolean),
      }
    })
}

const LOG_FORMAT = '--format=%x1e%H%x00%P%x00%T%x00%an%x00%ae%x00%ad%x00%cn%x00%ce%x00%cd%x00%B%x00'

export async function rewriteHistory(
  repo: Git,
  humans: ReadonlySet<string>,
  apply: boolean,
  backupSuffix: string,
): Promise<{ summary: TidySummary; remapped: Map<string, string> }> {
  const raw = await repo.raw([
    '-c',
    'core.quotepath=off',
    'log',
    '--reverse',
    '--date=raw',
    '--name-only',
    LOG_FORMAT,
  ])
  const commits = parseLog(raw)
  if (commits.some((commit) => commit.parents.length > 1)) {
    throw new StoreError('invalid', 'The history has merge commits, so it cannot be tidied')
  }
  const groups = planTidy(commits, humans)
  const summary: TidySummary = {
    before: commits.length,
    after: groups.length,
    merged: commits.length - groups.length,
    applied: false,
  }
  const remapped = new Map<string, string>()
  if (!apply || summary.merged === 0) return { summary, remapped }

  const head = await repo.run(['rev-parse', 'HEAD'])
  const backupRef = `refs/relay/backup/tidy-${backupSuffix}`
  await repo.run(['update-ref', backupRef, head])

  let previous: string | null = null
  let rewriting = false
  for (const group of groups) {
    const members = group.map((index) => commits[index]!)
    const first = members[0]!
    const last = members.at(-1)!
    if (!rewriting && members.length === 1) {
      previous = first.hash
      continue
    }
    rewriting = true
    const created: string = await repo.run(
      [
        'commit-tree',
        last.tree,
        ...(previous ? ['-p', previous] : []),
        '-m',
        mergedMessage(members),
      ],
      {
        GIT_AUTHOR_NAME: first.authorName,
        GIT_AUTHOR_EMAIL: first.authorEmail,
        GIT_AUTHOR_DATE: first.authorDate,
        GIT_COMMITTER_NAME: last.committerName,
        GIT_COMMITTER_EMAIL: last.committerEmail,
        GIT_COMMITTER_DATE: last.committerDate,
      },
    )
    for (const member of members) remapped.set(member.hash, created)
    previous = created
  }
  if (!previous) return { summary, remapped }

  const [oldTree, newTree] = await Promise.all([
    repo.run(['rev-parse', `${head}^{tree}`]),
    repo.run(['rev-parse', `${previous}^{tree}`]),
  ])
  if (oldTree !== newTree) {
    await repo.run(['update-ref', '-d', backupRef])
    throw new StoreError('invalid', 'The rewritten history does not match; nothing was changed')
  }
  await repo.run(['update-ref', 'HEAD', previous, head])
  return { summary: { ...summary, applied: true, backupRef }, remapped }
}
