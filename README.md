# Relay

A self-hosted, git-backed markdown store where people and AI agents edit documents together. Pages are plain markdown files in a git repository, with anchored comment threads, a REST API, an MCP server for agents, and a React UI.

## Quick start

Requires Node 22+, pnpm and git.

```sh
pnpm install
cp .env.example .env        # set ADMIN_PASSWORD
pnpm build
ADMIN_PASSWORD='choose a long passphrase' pnpm start
```

Open http://127.0.0.1:47821 and sign in as the admin (`ADMIN_HANDLE`, default `admin`). `ADMIN_PASSWORD` is only used to create the admin the first time; afterwards use `relay set-password`.

Development: `pnpm dev` (server, watches `src`) and `pnpm dev:web` (Vite UI). Checks: `pnpm check` (typecheck, lint, tests, format).

### Docker

```sh
cp .env.example .env        # set ADMIN_PASSWORD
docker compose up -d --build
```

The port is published on `127.0.0.1` only. Put a TLS-terminating reverse proxy in front for anything beyond your own machine, and set `TRUST_PROXY=1` when it sets `X-Forwarded-For` / `X-Forwarded-Proto`. Set `BIND=0.0.0.0` only if you understand the exposure.

## Configuration

| Variable         | Default     | Purpose                                                                                       |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `DATA_DIR`       | `./data`    | Where pages, threads and `state.db` live                                                      |
| `PORT`           | `47821`     | Listen port                                                                                   |
| `HOST`           | `127.0.0.1` | Listen address (the Docker image uses `0.0.0.0` inside)                                       |
| `ADMIN_PASSWORD` | -           | Creates the admin on first start                                                              |
| `ADMIN_HANDLE`   | `admin`     | Admin handle when first created                                                               |
| `ADMIN_NAME`     | handle      | Admin display name when first created                                                         |
| `TRUST_PROXY`    | unset       | `1` to trust `X-Forwarded-*` (client IP for login throttling, HTTPS detection for the cookie) |

## Data

`DATA_DIR` is a git repository: `<project>/project.yaml`, `<project>/<slug>.md` for pages, and `<slug>.threads.json` for comments. `state.db` (SQLite, not in git) holds the admin account, sessions, API tokens and the event log, so **back up the whole folder**.

A page file is YAML frontmatter (`id`, `title`, `status`, `tags`) followed by the markdown body. The API and MCP tools never expose the frontmatter: pages come back as structured fields plus a plain markdown `body`.

## Page API

- `status` is `draft` (default) or `published`. It is a label: it shows in listings and can filter `list_pages`, but does not change who can read or edit a page.
- Writes accept only the markdown body. A body that starts with Relay frontmatter (`id`, `title`, `status` or `tags` keys) is rejected.
- `edit_page` takes `edits` (`{ find, replace }` or `{ section, replace }`) **or** `body` (replace the whole body, keeping the id, history and threads), optionally with `status`. Pass `ifRevision` to refuse the change if the page moved.
- `read_page` returns `body` and an `outline` of headings; `includeBody: false` returns metadata and outline only.
- `create_page`, `edit_page` and `set_tags` return metadata only (`id`, `path`, `revision`, `updatedAt`, `tags`, `status`) unless `includeBody` is set.

## Agents (MCP)

Create an API token in the UI (Settings), then point an MCP client at `http://<host>:<port>/mcp` with the header `Authorization: Bearer rly_...`. Tokens are read or write scoped and can be limited to one project. Tools: `whoami`, `list_projects`, `create_project`, `list_pages`, `read_page`, `create_page`, `edit_page`, `set_tags`, `list_tags`, `search`, `history`, `diff`, `read_version`, `restore_version`, `delete_page`, `read_threads`, `open_threads`, `comment`, `reply`, `resolve`, `poll_events`.

The same operations are available over REST under `/api` (Bearer token or session cookie).

## CLI

`relay <command>` (`node dist/index.js <command>`): `serve` (default), `set-password`, `set-name`, `admin`, `watch`, `tidy-history`, `adopt-local`, `help`.

## Security notes

- A single admin signs in with a password (scrypt); sessions and API tokens are stored only as hashes. There is no anonymous mode.
- The server listens on loopback by default. Serve it over HTTPS if it is reachable by anyone else; the session cookie is `Secure` when HTTPS is detected.
- Cookie-authenticated writes must be same-origin; login is throttled per client address.
- Responses carry a strict Content-Security-Policy and other hardening headers; request bodies are capped at 5 MB.
- Treat API tokens like passwords. Revoke them in Settings.
- Report security issues privately rather than in a public issue.

## License

[MIT](LICENSE)
