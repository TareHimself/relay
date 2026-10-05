import { slugify } from './slug'

export function exportMarkdown(title: string, body: string): string {
  const heading = `# ${title}`
  const trimmed = body.trim()
  const firstLine = trimmed.split('\n', 1)[0]?.trim()
  const text = firstLine === heading ? trimmed : `${heading}\n\n${trimmed}`
  return `${text}\n`
}

export function exportFileName(title: string, taken: Set<string> = new Set()): string {
  let base: string
  try {
    base = slugify(title)
  } catch {
    base = 'page'
  }
  let name = `${base}.md`
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}.md`
  taken.add(name)
  return name
}
