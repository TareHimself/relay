import {
  CodeMirrorMarkdownEditor,
  type CodeMirrorMarkdownEditorProps,
} from '@latentic/live-markdown'

type DocEditorProps = Pick<
  CodeMirrorMarkdownEditorProps,
  'extensions' | 'onFlushReady' | 'selectionActions'
> & {
  body: string
  onChange: (value: string) => void
}

export function DocEditor({ body, onChange, ...rest }: DocEditorProps) {
  return <CodeMirrorMarkdownEditor value={body} onChange={onChange} {...rest} />
}
