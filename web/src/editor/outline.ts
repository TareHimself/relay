export interface OutlineItem {
  level: number
  title: string
  from: number
}

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/
const FENCE = /^\s*(`{3,}|~{3,})/

function plainTitle(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
}

export function outlineOf(text: string): OutlineItem[] {
  const items: OutlineItem[] = []
  let fence: string | null = null
  let offset = 0
  for (const line of text.split('\n')) {
    const marker = FENCE.exec(line)?.[1]
    if (fence === null && marker) fence = marker
    else if (fence !== null && marker && marker[0] === fence[0] && marker.length >= fence.length)
      fence = null
    else if (fence === null) {
      const match = HEADING.exec(line)
      const title = match ? plainTitle(match[2] ?? '') : ''
      if (match && title) items.push({ level: match[1]!.length, title, from: offset })
    }
    offset += line.length + 1
  }
  return items
}

export interface OutlineNode {
  item: OutlineItem
  index: number
  children: OutlineNode[]
}

export function outlineTree(items: readonly OutlineItem[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  items.forEach((item, index) => {
    const node: OutlineNode = { item, index, children: [] }
    while (stack.length > 0 && stack[stack.length - 1]!.item.level >= item.level) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push(node)
  })
  return roots
}

export function containsIndex(node: OutlineNode, index: number): boolean {
  return node.index === index || node.children.some((child) => containsIndex(child, index))
}

export function activeHeading(
  tops: readonly (number | null)[],
  threshold: number,
  atBottom = false,
): number {
  if (tops.length === 0) return -1
  if (atBottom) return tops.length - 1
  let active = 0
  tops.forEach((top, index) => {
    if (top !== null && top <= threshold) active = index
  })
  return active
}
