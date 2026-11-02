import {
  CodeMirrorMarkdownEditor,
  type CodeMirrorMarkdownEditorProps,
} from '@latentic/live-markdown'
import { normalizeLink } from './link'

type DocEditorProps = Pick<
  CodeMirrorMarkdownEditorProps,
  'extensions' | 'onFlushReady' | 'selectionActions'
> & {
  body: string
  onChange: (value: string) => void
}

function openExternal(url: string) {
  const safe = normalizeLink(url)
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer')
}

export function DocEditor({ body, onChange, ...rest }: DocEditorProps) {
  return (
    <CodeMirrorMarkdownEditor
      value={body}
      onChange={onChange}
      onOpenExternalUrl={openExternal}
      {...rest}
    />
  )
}
