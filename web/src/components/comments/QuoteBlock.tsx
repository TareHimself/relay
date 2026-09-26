import { styled } from '@linaria/react'

export const QuoteBlock = styled.blockquote`
  margin: 0;
  padding-left: 8px;
  border-left: 2px solid var(--mantine-color-default-border);
  color: var(--mantine-color-dimmed);
  font-size: 12px;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`
