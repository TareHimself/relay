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
    .cm-editor-host .cm-editor .cm-line {
      line-height: 1.65;
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
    .cm-editor-host .relay-done {
      position: absolute;
      top: calc(var(--relay-block-gap) + 1.42em - 12px);
      right: calc(0.75em + 32px);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 24px;
      padding: 0 10px 0 8px;
      border: 1px solid var(--mantine-color-default-border);
      border-radius: 999px;
      background: var(--mantine-color-body);
      color: var(--mantine-color-text);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1;
      cursor: pointer;
    }
    .cm-editor-host .relay-done:hover {
      background: var(--mantine-color-default-hover);
    }
    .cm-editor-host .relay-zoom {
      position: absolute;
      inset-block-start: 0.375rem;
      inset-inline-end: 3.125rem;
      display: grid;
      place-items: center;
      width: 1.55rem;
      height: 1.45rem;
      padding: 0;
      color: var(--cds-text-secondary);
      background: var(--cds-layer-01);
      border: 0.0625rem solid var(--cds-border-subtle-01);
      border-radius: 999rem;
      cursor: pointer;
      opacity: 0;
      transition: opacity 80ms ease;
    }
    .cm-editor-host .cm-mermaid-block:hover .relay-zoom,
    .cm-editor-host .relay-zoom:focus-visible {
      opacity: 1;
    }
    .cm-editor-host .relay-zoom:hover {
      color: var(--mantine-color-text);
    }
    .relay-lightbox {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      overscroll-behavior: contain;
      touch-action: none;
      cursor: grab;
      display: grid;
      place-items: center;
      background: var(--mantine-color-body);
    }
    .relay-lightbox[data-dragging] {
      cursor: grabbing;
    }
    .relay-lightbox__diagram {
      display: flex;
      justify-content: center;
      width: 100%;
      line-height: 0;
      user-select: none;
    }
    .relay-lightbox__diagram > svg {
      flex: none;
      pointer-events: none;
    }
    :root[data-mantine-color-scheme='dark'] .relay-lightbox__diagram > svg {
      filter: invert(0.92) hue-rotate(180deg);
    }
    .cm-editor-host .cm-inline-code,
    .cm-editor-host .cm-highlight {
      border-radius: var(--mantine-radius-sm);
    }
    .cm-editor-host .cm-editor .cm-mermaid-block {
      margin: 0;
      padding: 1.25em 0.75em;
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
    .cm-editor-host .cm-table-inserter::before {
      content: '';
      position: absolute;
    }
    .cm-editor-host .cm-table-inserter--row::before {
      inset: -4px -14px -4px -4px;
    }
    .cm-editor-host .cm-table-inserter--column::before {
      inset: -4px -4px -14px -4px;
    }
    .cm-editor-host .relay-svg-block {
      display: flex;
      justify-content: center;
      padding: 12px;
      border-radius: var(--mantine-radius-md);
      cursor: pointer;
    }
    .cm-editor-host .relay-svg-block img {
      max-width: 100%;
      height: auto;
    }
    .cm-editor-host .relay-svg-block[data-error] {
      color: var(--mantine-color-red-text);
    }
    .cm-editor-host .cm-link {
      cursor: pointer;
    }
    .cm-editor-host .relay-link-kind::before {
      content: '';
      display: inline-block;
      width: 1em;
      height: 1em;
      margin-right: 0.3em;
      vertical-align: -0.15em;
      background: currentColor;
      -webkit-mask: var(--relay-link-icon) center / contain no-repeat;
      mask: var(--relay-link-icon) center / contain no-repeat;
    }
    .cm-editor-host .relay-link-kind--doc {
      --relay-link-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 3v4a1 1 0 0 0 1 1h4'/%3E%3Cpath d='M17 21h-10a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z'/%3E%3Cpath d='M9 13h6M9 17h6'/%3E%3C/svg%3E");
    }
    .cm-editor-host .relay-link-kind--gdoc {
      --relay-link-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 3v4a1 1 0 0 0 1 1h4'/%3E%3Cpath d='M17 21h-10a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z'/%3E%3Cpath d='M9 13h6M9 17h6'/%3E%3C/svg%3E");
    }
    .cm-editor-host .relay-link-kind--github {
      --relay-link-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2c2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2a4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0c-2.4-1.6-3.5-1.3-3.5-1.3a4.2 4.2 0 0 0-.1 3.2a4.6 4.6 0 0 0-1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6.6-.6 1.2-.5 2v3.5'/%3E%3C/svg%3E");
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
