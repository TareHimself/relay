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

Open http://127.0.0.1:47821 and sign in as the admin (`ADMIN_HANDLE`, default `admin`). The example password from `.env.example` is refused, so pick your own. `ADMIN_PASSWORD` is only used to create the admin the first time; afterwards use `relay set-password`.

Development: `pnpm dev` (server, watches `src`) and `pnpm dev:web` (Vite UI). Checks: `pnpm check` (typecheck, lint, tests, format).

### Docker

```sh
cp .env.example .env        # set ADMIN_PASSWORD
docker compose up -d --build
```

The port is published on `127.0.0.1` only. Put a TLS-terminating reverse proxy in front for anything beyond your own machine, and set `TRUST_PROXY=1` when it sets `X-Forwarded-For` / `X-Forwarded-Proto`. Set `BIND=0.0.0.0` only if you understand the exposure.

Everything lives under one host folder, `./data`: Relay's own data is at `./data/relay` (`DATA_DIR` inside the container), and the optional Tailscale sidecar below keeps its state at `./data/tailscale`, so a single folder covers the whole stack for backup or migration.

#### Tailscale instead of a public port

An optional `tailscale` service proxies Relay over your tailnet instead of publishing a port at all. Generate a device auth key at [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys) — **"Generate auth key"**, not an OAuth client secret or other API key, or the container will reject it as invalid — and set it as `TS_AUTHKEY` in `.env`, along with `TRUST_PROXY=1`:

```sh
# in .env: TS_AUTHKEY=tskey-auth-..., TS_HOSTNAME=relay (default), TRUST_PROXY=1
docker compose --profile tailscale up -d --build
```

Relay becomes reachable at `https://relay.<your-tailnet>.ts.net` (or your `TS_HOSTNAME`) with TLS handled by Tailscale. `TRUST_PROXY=1` is required so Relay sees the real client IP and HTTPS from the `X-Forwarded-*` headers Tailscale's proxy sets.

Without `TS_AUTHKEY`, the container falls back to an interactive login link in `docker compose logs tailscale` — but `tailscale up` there times out and restarts (generating a new link, and a new pending-node entry in your tailnet) roughly every 60–90 seconds, so it's easy to miss. The auth key avoids that entirely and is the recommended path.

## Configuration

| Variable         | Default     | Purpose                                                                                       |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `DATA_DIR`       | `./data`    | Parent of `projects/` (git repo) and `db/` (`state.db`) — see [Data](#data)                   |
| `PORT`           | `47821`     | Listen port                                                                                   |
| `HOST`           | `127.0.0.1` | Listen address (the Docker image uses `0.0.0.0` inside)                                       |
| `ADMIN_PASSWORD` | -           | Creates the admin on first start                                                              |
| `ADMIN_HANDLE`   | `admin`     | Admin handle when first created                                                               |
| `ADMIN_NAME`     | handle      | Admin display name when first created                                                         |
| `TRUST_PROXY`    | unset       | `1` to trust `X-Forwarded-*` (client IP for login throttling, HTTPS detection for the cookie) |
| `PUBLIC_URL`     | unset       | Makes the `url` field on pages absolute (see [Page API](#page-api)); no trailing slash        |
| `BIND`           | `127.0.0.1` | Docker Compose only: host address the port is published on                                    |
| `TS_AUTHKEY`     | -           | Docker Compose `tailscale` profile only: tailnet auth key (blank = login link in the logs)    |
| `TS_HOSTNAME`    | `relay`     | Docker Compose `tailscale` profile only: MagicDNS name (`https://<name>.<tailnet>.ts.net`)    |

## Data

`DATA_DIR` holds two sibling folders, both under the one bind-mounted directory:

- `projects/` — the git repository: `<project>/project.yaml`, `<project>/<slug>.md` for pages, `<slug>.threads.json` for comments.
- `db/` — `state.db` (SQLite, not in git): the admin account, sessions, API tokens and the event log.

Keeping `db/` outside the git repo means it can never end up in a commit, by construction, rather than by relying on a `.gitignore` entry. **Back up the whole `DATA_DIR` folder** (both subfolders).

An install from before this split (a flat `DATA_DIR` with the git repo and `state.db` as direct siblings) is migrated automatically and non-destructively the first time it starts under the new layout: everything moves into `projects/` except `state.db*`, which moves into `db/`.

A page file is YAML frontmatter (`id`, `title`, `tags`) followed by the markdown body. The API and MCP tools never expose the frontmatter: pages come back as structured fields plus a plain markdown `body`.

## Page API

- Writes accept only the markdown body. A body that starts with Relay frontmatter (`id`, `title` or `tags` keys) is rejected.
- `edit_page` takes `edits` (`{ find, replace }` or `{ section, replace }`) **or** `body` (replace the whole body, keeping the id, history and threads). Pass `ifRevision` to refuse the change if the page moved.
- `rename_page` changes a page's title; its file is renamed to match (history and comment threads move with it). `rename_project` changes a project's display name without moving anything.
- `read_page` returns `body` and an `outline` of headings; `includeBody: false` returns metadata and outline only.
- `create_page`, `edit_page`, `set_tags` and `rename_page` return metadata only (`id`, `path`, `url`, `revision`, `updatedAt`, `tags`) unless `includeBody` is set. `url` is a short link (`/doc/<id>`, page ids are unique on their own) that the web app resolves and forwards to the page's real location — relative by default, so it's correct under any host Relay is reachable at; set `PUBLIC_URL` to get an absolute, clickable link instead (worth it once Relay has one settled address, e.g. behind Tailscale).

## Agents (MCP)

Create an API token in the UI (Settings), then point an MCP client at `http://<host>:<port>/mcp` with the header `Authorization: Bearer rly_...`. Tokens are read or write scoped and can be limited to one project. Tools: `whoami`, `list_projects`, `create_project`, `rename_project`, `list_pages`, `read_page`, `create_page`, `edit_page`, `rename_page`, `set_tags`, `list_tags`, `search`, `history`, `diff`, `read_version`, `restore_version`, `delete_page`, `read_threads`, `open_threads`, `comment`, `reply`, `resolve`, `poll_events`.

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
