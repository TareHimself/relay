import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { exportFileName, exportMarkdown } from './export'
import { buildZip } from './zip'

function readZip(zip: Buffer) {
  const entries: { name: string; text: string }[] = []
  let offset = 0
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const checksum = zip.readUInt32LE(offset + 14)
    const size = zip.readUInt32LE(offset + 18)
    const nameLength = zip.readUInt16LE(offset + 26)
    const start = offset + 30 + nameLength
    const data = zip.subarray(start, start + size)
    expect(crc32(data)).toBe(checksum)
    entries.push({
      name: zip.subarray(offset + 30, start).toString('utf8'),
      text: data.toString('utf8'),
    })
    offset = start + size
  }
  const end = zip.length - 22
  expect(zip.readUInt32LE(end)).toBe(0x06054b50)
  expect(zip.readUInt16LE(end + 10)).toBe(entries.length)
  return entries
}

describe('exportMarkdown', () => {
  it('adds the title as a heading', () => {
    expect(exportMarkdown('Plan', 'body text')).toBe('# Plan\n\nbody text\n')
  })

  it('does not duplicate a matching leading heading', () => {
    expect(exportMarkdown('Plan', '# Plan\n\nbody')).toBe('# Plan\n\nbody\n')
  })

  it('handles an empty body', () => {
    expect(exportMarkdown('Plan', '\n')).toBe('# Plan\n\n\n')
  })
})

describe('exportFileName', () => {
  it('slugs titles and keeps names unique', () => {
    const taken = new Set<string>()
    expect(exportFileName('06 Pass A: Building', taken)).toBe('06-pass-a-building.md')
    expect(exportFileName('06 Pass A: Building', taken)).toBe('06-pass-a-building-2.md')
    expect(exportFileName('???', taken)).toBe('page.md')
  })
})

describe('buildZip', () => {
  it('produces a readable archive with utf-8 names and valid checksums', () => {
    const zip = buildZip([
      { name: 'a.md', data: Buffer.from('# A\n'), modified: new Date('2026-01-02T03:04:06Z') },
      { name: 'é.md', data: Buffer.from('café\n'), modified: new Date('2026-01-02T03:04:06Z') },
    ])
    expect(readZip(zip)).toEqual([
      { name: 'a.md', text: '# A\n' },
      { name: 'é.md', text: 'café\n' },
    ])
  })
})
