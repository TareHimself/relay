const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n(?:\r?\n)?/

export function splitFrontmatter(markdown: string): { head: string; body: string } {
  const head = FRONTMATTER.exec(markdown)?.[0] ?? ''
  return { head, body: markdown.slice(head.length) }
}
