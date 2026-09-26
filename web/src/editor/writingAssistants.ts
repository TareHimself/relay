import { EditorView } from '@codemirror/view'
import type { MarkdownExtension } from '@latentic/live-markdown'

export const NO_WRITING_ASSISTANT = {
  'data-gramm': 'false',
  'data-gramm_editor': 'false',
  'data-enable-grammarly': 'false',
} as const

export const noWritingAssistant: MarkdownExtension = {
  name: 'no-writing-assistant',
  version: '1.0.0',
  extensions: [EditorView.contentAttributes.of(NO_WRITING_ASSISTANT)],
}
