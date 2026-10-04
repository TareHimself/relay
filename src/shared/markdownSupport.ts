export const MARKDOWN_SUPPORT = {
  format: 'Pages are GitHub-flavoured markdown. The editor renders these inline.',
  supported: [
    { feature: 'Headings', syntax: '# to ###### (ATX only, setext underlines are not rendered)' },
    {
      feature: 'Text styles',
      syntax: '**bold**, *italic*, ~~strikethrough~~, `inline code`',
    },
    { feature: 'Lists', syntax: '-, 1., and task lists with - [ ] / - [x]' },
    { feature: 'Tables', syntax: 'GFM pipe tables, with optional alignment row' },
    { feature: 'Code blocks', syntax: 'Fenced with a language label, e.g. ```ts' },
    {
      feature: 'Mermaid diagrams',
      syntax: 'Fenced block with the language mermaid, rendered as a live diagram',
    },
    {
      feature: 'SVG graphics',
      syntax:
        'Fenced block with the language svg containing a full <svg xmlns="http://www.w3.org/2000/svg" ...> element, rendered as an image (no scripts, no external resources)',
    },
    { feature: 'Math', syntax: 'LaTeX via KaTeX: $inline$ and $$display$$' },
    { feature: 'Footnotes', syntax: 'text[^1] with [^1]: note' },
    { feature: 'Links', syntax: '[text](https://example.com)' },
    {
      feature: 'Images',
      syntax:
        '![alt](https://host/img.png), including .svg URLs and data:image/svg+xml URIs (URL-encode the SVG)',
    },
    { feature: 'Horizontal rule', syntax: '---' },
    { feature: 'Blockquote', syntax: '> quote' },
  ],
  notSupported: [
    'Raw <svg> or other HTML blocks outside a svg fence (shown as source code, not rendered)',
    'Uploading or hosting files (images and SVGs must be a URL or inline)',
    'YAML frontmatter in bodies (rejected, Relay manages it)',
  ],
  tips: [
    'Prefer a mermaid diagram or a table over long prose when it explains the mechanism.',
    'Comments anchor to text. Text inside a table cell is commentable but is not highlighted.',
  ],
} as const

export function markdownSupportSummary(): string {
  const supported = MARKDOWN_SUPPORT.supported.map((item) => `- ${item.feature}: ${item.syntax}`)
  const unsupported = MARKDOWN_SUPPORT.notSupported.map((item) => `- ${item}`)
  return [
    'What pages can render (always true, call markdown_support for the same list):',
    ...supported,
    'Not supported:',
    ...unsupported,
  ].join('\n')
}
