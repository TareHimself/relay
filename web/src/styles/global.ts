import { css } from '@linaria/core'

export const globals = css`
  :global() {
    @keyframes relay-fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    :root {
      --relay-surround: var(--mantine-color-gray-0);
      --relay-block-gap: 12px;
      --relay-mark-active: rgba(255, 212, 59, 0.65);
      --cds-background: var(--mantine-color-body);
      --cds-text-primary: var(--mantine-color-text);
      --cds-text-secondary: var(--mantine-color-dimmed);
      --cds-text-error: var(--mantine-color-red-text);
      --cds-link-primary: var(--mantine-color-anchor);
      --cds-icon-primary: var(--mantine-color-text);
      --cds-icon-secondary: var(--mantine-color-dimmed);
      --cds-border-subtle-01: var(--mantine-color-default-border);
      --cds-border-subtle-02: var(--mantine-color-default-border);
      --cds-border-interactive: var(--mantine-primary-color-filled);
      --cds-focus: var(--mantine-primary-color-filled);
      --cds-highlight: var(--mantine-primary-color-light);
      --cds-layer-01: var(--mantine-color-default-hover);
      --cds-layer-hover-01: var(--mantine-color-default-border);
      --cds-layer-accent-01: var(--mantine-color-default-border);
      --cds-layer-accent-hover-01: var(--mantine-color-default-border);
      --cds-support-error: var(--mantine-color-red-filled);
      --cds-support-success: var(--mantine-color-green-filled);
    }
    :root[data-mantine-color-scheme='dark'] {
      --relay-surround: var(--mantine-color-dark-8);
      --relay-mark-active: rgba(255, 212, 59, 0.38);
    }
    .mantine-Spotlight-action[data-selected],
    .mantine-Spotlight-action:hover {
      background: var(--mantine-color-default-hover);
      color: var(--mantine-color-text);
    }
    :root[data-mantine-color-scheme='dark'] .cm-mermaid-block > svg {
      filter: invert(0.92) hue-rotate(180deg);
    }
    body {
      margin: 0;
    }
    .cm-editor-host {
      display: block;
      overflow: visible;
    }
    .cm-editor-host__scroll,
    .cm-editor-host .cm-scroller {
      overflow: visible;
    }
    .cm-editor-host .cm-editor {
      height: auto;
      outline: none;
    }
    .cm-editor-host .cm-editor .cm-scroller {
      padding: 0;
    }
    .cm-editor-host .cm-editor .cm-content {
      max-width: none;
      margin: 0;
    }
    .cm-editor-host .cm-fenced-code:not(.cm-fenced-code + .cm-fenced-code) {
      padding-top: calc(var(--relay-block-gap) + 0.7em);
      clip-path: inset(
        var(--relay-block-gap) 0 0 0 round var(--mantine-radius-md) var(--mantine-radius-md) 0 0
      );
    }
    .cm-editor-host .cm-fenced-code:not(:has(+ .cm-fenced-code)) {
      padding-bottom: calc(var(--relay-block-gap) + 0.15em);
      clip-path: inset(
        0 0 var(--relay-block-gap) 0 round 0 0 var(--mantine-radius-md) var(--mantine-radius-md)
      );
    }
    .cm-editor-host .cm-fenced-code {
      position: relative;
    }
    .cm-editor-host .relay-copy {
      position: absolute;
      top: calc(var(--relay-block-gap) + 1.42em - 12px);
      right: 0.75em;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: var(--mantine-radius-sm);
      background: transparent;
      color: var(--mantine-color-dimmed);
      font-size: inherit;
      line-height: 1;
      cursor: pointer;
      opacity: 0.7;
    }
    .cm-editor-host .relay-copy:hover {
      background: var(--mantine-color-default-hover);
      color: var(--mantine-color-text);
      opacity: 1;
    }
    .cm-editor-host .relay-copy[data-state='copied'] {
      color: var(--mantine-color-green-text);
      opacity: 1;
    }
    .cm-editor-host .cm-inline-code,
    .cm-editor-host .cm-highlight {
      border-radius: var(--mantine-radius-sm);
    }
    .cm-editor-host .cm-image-widget,
    .cm-editor-host .cm-mermaid-block,
    .cm-editor-host .cm-image-menu {
      border-radius: var(--mantine-radius-md);
    }
    .cm-editor-host .cm-table-widget {
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid var(--cds-border-subtle-02);
      border-radius: var(--mantine-radius-md);
      overflow: hidden;
    }
    .cm-editor-host .cm-table-widget th,
    .cm-editor-host .cm-table-widget td {
      border: 0;
      border-right: 1px solid var(--cds-border-subtle-02);
      border-bottom: 1px solid var(--cds-border-subtle-02);
    }
    .cm-editor-host .cm-table-widget tr > :last-child {
      border-right: 0;
    }
    .cm-editor-host .cm-table-widget tbody tr:last-child td {
      border-bottom: 0;
    }
    .relay-heading-placeholder {
      color: var(--mantine-color-dimmed);
      opacity: 0.55;
      pointer-events: none;
      user-select: none;
    }
    .relay-comment {
      border-radius: var(--mantine-radius-sm);
    }
    .relay-comment--active {
      background: var(--relay-mark-active);
    }
    .relay-comment--draft {
      background: rgba(64, 192, 87, 0.35);
    }
  }
`
