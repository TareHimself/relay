import { css } from '@linaria/core'
import { IconChevronRight } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { containsIndex, outlineTree, type OutlineNode } from '../../editor/outline'
import { useOutlineStore } from '../../stores/outlineStore'

const list = css`
  display: flex;
  flex-direction: column;
  gap: 1px;
`
const children = css`
  margin-left: 9px;
  padding-left: 6px;
  border-left: 1px solid var(--mantine-color-default-border);
`
const row = css`
  display: flex;
  align-items: flex-start;
  border-radius: var(--mantine-radius-md);

  &:hover {
    background: var(--mantine-color-default-hover);
  }
`
const toggleButton = css`
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 26px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--mantine-color-dimmed);
  cursor: pointer;

  & > svg {
    transition: transform 120ms ease;
  }

  &[aria-expanded='true'] > svg {
    transform: rotate(90deg);
  }
`
const spacer = css`
  flex: none;
  width: 22px;
`
const label = css`
  flex: 1;
  min-width: 0;
  padding: 4px 8px 4px 0;
  border: 0;
  background: transparent;
  color: var(--mantine-color-dimmed);
  font: inherit;
  font-size: 13px;
  line-height: 1.35;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;

  &:hover {
    color: var(--mantine-color-text);
  }

  &[data-active='true'] {
    color: var(--mantine-color-green-text);
    font-weight: 600;
  }

  &[data-contains='true'] {
    color: var(--mantine-color-text);
  }
`

interface BranchProps {
  node: OutlineNode
  active: number
  collapsed: ReadonlySet<string>
  onToggle: (key: string) => void
  onJump: (from: number) => void
}

function Branch({ node, active, collapsed, onToggle, onJump }: BranchProps) {
  const key = `${node.item.level}:${node.item.title}`
  const expandable = node.children.length > 0
  const open = !collapsed.has(key)
  const holdsActive = expandable && !open && containsIndex(node, active)

  return (
    <div>
      <div className={row}>
        {expandable ? (
          <button
            type="button"
            className={toggleButton}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.item.title}`}
            onClick={() => onToggle(key)}
          >
            <IconChevronRight size={14} />
          </button>
        ) : (
          <span className={spacer} />
        )}
        <button
          type="button"
          className={label}
          data-active={node.index === active}
          data-contains={holdsActive}
          aria-current={node.index === active ? 'location' : undefined}
          onClick={() => onJump(node.item.from)}
        >
          {node.item.title}
        </button>
      </div>
      {expandable && open && (
        <div className={children}>
          {node.children.map((child) => (
            <Branch
              key={`${child.index}:${child.item.title}`}
              node={child}
              active={active}
              collapsed={collapsed}
              onToggle={onToggle}
              onJump={onJump}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function OutlineTree() {
  const items = useOutlineStore((state) => state.items)
  const active = useOutlineStore((state) => state.active)
  const jump = useOutlineStore((state) => state.jump)
  const tree = useMemo(() => outlineTree(items), [items])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  return (
    <nav aria-label="Document outline" className={list}>
      {tree.map((node) => (
        <Branch
          key={`${node.index}:${node.item.title}`}
          node={node}
          active={active}
          collapsed={collapsed}
          onToggle={toggle}
          onJump={(from) => jump?.(from)}
        />
      ))}
    </nav>
  )
}
