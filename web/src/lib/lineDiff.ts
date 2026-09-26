export type DiffKind = 'add' | 'del' | 'ctx' | 'gap'

interface DiffLine {
  kind: DiffKind
  text: string
}

export interface LineDiff {
  lines: DiffLine[]
  added: number
  removed: number
}

const MAX_CELLS = 4_000_000

function toLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function middleOps(a: string[], b: string[]): DiffLine[] | null {
  if (a.length * b.length > MAX_CELLS) return null
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!)
    }
  }
  const ops: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'ctx', text: a[i]! })
      i += 1
      j += 1
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      ops.push({ kind: 'del', text: a[i]! })
      i += 1
    } else {
      ops.push({ kind: 'add', text: b[j]! })
      j += 1
    }
  }
  for (; i < a.length; i += 1) ops.push({ kind: 'del', text: a[i]! })
  for (; j < b.length; j += 1) ops.push({ kind: 'add', text: b[j]! })
  return ops
}

function collapse(all: DiffLine[], context: number): DiffLine[] {
  const near = new Array<boolean>(all.length).fill(false)
  all.forEach((line, index) => {
    if (line.kind === 'ctx') return
    for (
      let k = Math.max(0, index - context);
      k <= Math.min(all.length - 1, index + context);
      k += 1
    )
      near[k] = true
  })
  const result: DiffLine[] = []
  let skipped = 0
  const flush = () => {
    if (skipped === 0) return
    result.push({ kind: 'gap', text: `${skipped} unchanged ${skipped === 1 ? 'line' : 'lines'}` })
    skipped = 0
  }
  all.forEach((line, index) => {
    if (near[index]) {
      flush()
      result.push(line)
    } else {
      skipped += 1
    }
  })
  flush()
  return result
}

export function lineDiff(from: string, to: string, context = 2): LineDiff | null {
  const a = toLines(from)
  const b = toLines(to)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  const middle = middleOps(a.slice(start, endA), b.slice(start, endB))
  if (!middle) return null
  const all: DiffLine[] = [
    ...a.slice(0, start).map((text): DiffLine => ({ kind: 'ctx', text })),
    ...middle,
    ...a.slice(endA).map((text): DiffLine => ({ kind: 'ctx', text })),
  ]
  const added = middle.filter((line) => line.kind === 'add').length
  const removed = middle.filter((line) => line.kind === 'del').length
  if (added === 0 && removed === 0) return { lines: [], added, removed }
  return { lines: collapse(all, context), added, removed }
}
