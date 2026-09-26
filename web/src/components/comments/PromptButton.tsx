import { css } from '@linaria/core'
import { UnstyledButton } from '@mantine/core'
import type { MouseEvent, ReactNode } from 'react'

const prompt = css`
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-md);
  color: var(--mantine-color-dimmed);
  font-size: var(--mantine-font-size-xs);
  text-align: left;

  &:hover {
    border-color: var(--mantine-color-gray-5);
  }
`

interface PromptButtonProps {
  children: ReactNode
  onClick: (event: MouseEvent) => void
}

export function PromptButton({ children, onClick }: PromptButtonProps) {
  return (
    <UnstyledButton className={prompt} onClick={onClick}>
      {children}
    </UnstyledButton>
  )
}
