import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { codeOf, fencedBlocks } from './fences'

function codes(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdown()] })
  return fencedBlocks(state).map((fence) => codeOf(state, fence))
}

describe('fencedBlocks', () => {
  it('extracts the code of each fenced block without the fences', () => {
    expect(codes('intro\n\n```js\nlet a\nlet b\n```\n\ntext\n\n```\nsecond\n```\n')).toEqual([
      'let a\nlet b',
      'second',
    ])
  })

  it('handles tilde fences, unclosed fences and empty blocks', () => {
    expect(codes('~~~\ntilde\n~~~')).toEqual(['tilde'])
    expect(codes('```\nopen ended')).toEqual(['open ended'])
    expect(codes('```\n```')).toEqual([''])
  })

  it('keeps blank lines inside code and recognises an indented closing fence', () => {
    expect(codes('```\na\n\nb\n  ```\n')).toEqual(['a\n\nb'])
  })

  it('ignores documents without fences', () => {
    expect(codes('just text')).toEqual([])
  })
})
