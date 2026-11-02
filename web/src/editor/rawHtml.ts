import type { MarkdownExtension } from '@latentic/live-markdown'
import { nodeRulesFacet, raw } from '@latentic/live-markdown'

export const rawHtml: MarkdownExtension = {
  name: 'relay-raw-html',
  version: '1.0.0',
  extensions: [
    nodeRulesFacet.of({
      HTMLBlock: raw('page content is untrusted, so HTML stays source'),
      HTMLTag: raw('page content is untrusted, so HTML stays source'),
    }),
  ],
}
