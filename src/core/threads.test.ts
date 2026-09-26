import { describe, expect, it } from 'vitest'
import {
  addMessage,
  anchorFor,
  editMessage,
  mentionsIn,
  parseThreads,
  removeMessage,
  startThread,
} from './threads'

describe('mentionsIn', () => {
  it('extracts unique lowercase handles and ignores emails', () => {
    expect(mentionsIn('@Claude and @claude, cc @code-bot; mail me@example.com')).toEqual([
      'claude',
      'code-bot',
    ])
  })
})

describe('anchorFor', () => {
  it('captures quote, context and offset for a unique match', () => {
    const anchor = anchorFor('alpha beta gamma', 'beta')
    expect(anchor).toEqual({ exact: 'beta', prefix: 'alpha ', suffix: ' gamma', offset: 6 })
  })

  it('uses surrounding context to pick between repeated quotes', () => {
    const markdown = 'first cat sat. second cat ran. third cat hid.'
    const anchor = anchorFor(markdown, 'cat', { prefix: 'the second ', suffix: ' ran. third' })
    expect(anchor.offset).toBe(markdown.indexOf('cat ran'))
    expect(() => anchorFor(markdown, 'cat', { prefix: 'zzz', suffix: 'zzz' })).toThrowError(
      /more than once/,
    )
  })

  it('refuses missing and ambiguous quotes', () => {
    expect(() => anchorFor('one two two', 'three')).toThrowError(/changed/)
    expect(() => anchorFor('one two two', 'two')).toThrowError(/more than once/)
  })
})

describe('thread lifecycle', () => {
  const at = '2026-09-24T00:00:00.000Z'

  it('addresses mentioned agents and marks the thread answered when one replies', () => {
    const thread = startThread({ author: 'tare', body: 'Please review @Claude', at })
    expect(thread).toMatchObject({ status: 'open', to: ['claude'] })

    const answered = addMessage(thread, 'Claude', 'Done', at)
    expect(answered.thread.status).toBe('answered')
    expect(answered.addressed).toEqual([])

    const reopened = addMessage(answered.thread, 'tare', 'Also ask @reviewer', at)
    expect(reopened.thread.status).toBe('open')
    expect(reopened.addressed).toEqual(['reviewer'])
    expect(reopened.thread.to).toEqual(['claude', 'reviewer'])
    expect(reopened.thread.messages).toHaveLength(3)
  })

  it('rejects malformed thread files', () => {
    expect(() => parseThreads('{"threads":[{"id":1}]}')).toThrowError(/malformed/)
    expect(parseThreads(null)).toEqual([])
  })
})

describe('editMessage', () => {
  const at = '2026-09-24T00:00:00.000Z'
  const later = '2026-09-25T00:00:00.000Z'

  it('lets the author edit, marks the edit and addresses new mentions', () => {
    const thread = startThread({ author: 'tare', body: 'First draft', at })
    const id = thread.messages[0]?.id ?? ''
    const { thread: edited, addressed } = editMessage(thread, id, 'tare', 'Better, @claude?', later)
    expect(edited.messages[0]).toMatchObject({ body: 'Better, @claude?', editedAt: later })
    expect(edited.to).toEqual(['claude'])
    expect(addressed).toEqual(['claude'])
  })

  it('returns the same thread when nothing changed', () => {
    const thread = startThread({ author: 'tare', body: 'Same', at })
    const id = thread.messages[0]?.id ?? ''
    expect(editMessage(thread, id, 'tare', 'Same', later).thread).toBe(thread)
  })

  it('refuses other authors and unknown messages', () => {
    const thread = startThread({ author: 'tare', body: 'Mine', at })
    const id = thread.messages[0]?.id ?? ''
    expect(() => editMessage(thread, id, 'claude', 'Hijack', later)).toThrowError(/author/)
    expect(() => editMessage(thread, 'nope', 'tare', 'x', later)).toThrowError(/not found/)
  })
})

describe('removeMessage', () => {
  const at = '2026-09-24T00:00:00.000Z'

  it('removes a reply but keeps the thread', () => {
    const started = startThread({ author: 'tare', body: 'Q', at })
    const { thread } = addMessage(started, 'tare', 'follow-up', at)
    const replyId = thread.messages[1]?.id ?? ''
    expect(removeMessage(thread, replyId, 'tare')?.messages).toHaveLength(1)
  })

  it('removes the whole thread when the first message goes', () => {
    const thread = startThread({ author: 'tare', body: 'Q', at })
    expect(removeMessage(thread, thread.messages[0]?.id ?? '', 'tare')).toBeNull()
  })

  it('refuses other authors', () => {
    const thread = startThread({ author: 'tare', body: 'Q', at })
    expect(() => removeMessage(thread, thread.messages[0]?.id ?? '', 'claude')).toThrowError(
      /author/,
    )
  })
})
