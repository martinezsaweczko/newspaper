# CLAUDE.md — NewsPaper (private newsstand)

A password-protected web app that turns a shared folder of newspaper PDFs into a newsstand:
every edition is shown as its rendered front page (never the filename), grouped by region,
and opens as a PDF on click.

SvelteKit 3 + Svelte 5 (runes) + TypeScript + Tailwind CSS 4. Node adapter, shipped as a container.
See README.md for the product overview, configuration and deploy.

## Commands

- `npm run dev` — dev server
- `npm run check` — svelte-check / types
- `npm run lint` / `npm run format` — prettier + eslint
- `npm run test:unit -- --run` — vitest
- `npm run build` — production build to `build/` (`node build`)
- `npm run user:add -- <name>` / `npm run user:remove -- <name>` / `npm run user:logout-all -- <name>` — manage logins
- `node scripts/make-samples.mjs` — generate synthetic sample editions into `newspapers/`
- `podman build -t newspaper .` (or docker) — container image; `podman compose up -d` — run it

## Conventions

- Svelte 5 runes only (`$state`, `$derived`, `$props`); no legacy `export let` / stores for local state.
- Import shared code via the `#lib/...` package import (SvelteKit 3 removed `$lib`).
- **UI copy is Spanish (es-ES)**; code, comments, logs, CLI and docs stay English. `<html lang="es">`.
- **European formats everywhere**: dates `dd/mm/yyyy`, long dates `martes, 17 de noviembre de 2026`
  (`formatLongDate`, inside sentences) or capitalised as a headline (`formatDateline`: `<title>`,
  the stand `h1`, login dateline, back-issue captions), compact `mar 17 nov`.
  `src/lib/format/date.ts` is the single source of truth: never call `Intl`/`toLocale*` or print a
  raw ISO date in a template. Dates travel as ISO `YYYY-MM-DD` (URLs).
- Server-only code in `src/lib/server/`. Config via env declared in `src/env.ts`; never commit `.env`.
- Tests next to code: `*.spec.ts` (unit), `*.svelte.spec.ts` (component). Pure logic stays pure
  (root dir / config passed in) so it is unit-testable with tmp dirs.
- Conventional Commits. Small, tested changes.
- Real newspaper PDFs are never committed or used in tests; build synthetic ones.

## Domain

- **Shared folder** (`NEWSPAPER_DIR`, dev default `./newspapers`): one flat folder, all PDFs together.
  Read-only for the app. Hidden files are ignored.
- **Edition** = one PDF. Parsed from the filename: masthead (the newspaper) + optional date
  (`YYYY-MM-DD`, `YYYYMMDD`, `DD-MM-YYYY`; falls back to file mtime).
- **Region is logical, not a folder**: `regions.json` (in `DATA_DIR`, seeded from
  `src/lib/server/regions.default.json`) maps each region to masthead patterns, matched case- and
  accent-insensitively against the normalised filename. Unmatched mastheads are **Nacional** (`NATIONAL` in `regions.ts`; old `?region=National` links just show all).
  Changing a region = editing the mapping, never moving files.
- **Ids** are base64url of the relative path; `resolveId` rejects traversal, absolute paths,
  non-PDF files, symlinks leaving the root and missing files.

## Backend

- Auth: `DATA_DIR/users.json` with scrypt hashes (node:crypto, no auth deps), HMAC-signed session
  cookie (`SESSION_SECRET`, httpOnly, sameSite=lax, `COOKIE_SECURE` off by default for plain-http LAN).
  Tokens carry the user's `sessionVersion` (`v`; absent = 1 for pre-version tokens); a password
  change or `user:logout-all` bumps it, revoking every session. `hooks.server.ts` checks it via the
  cached `createUserDirectory` (stat per request, re-read on change) and guards every route except
  `/login` and static assets; `next` redirects are sanitised to same-site relative paths, checked
  after dot-segment normalisation. In-memory login throttle (`createLoginThrottle`): per IP+user 5,
  per user 10, per IP 50 failures / 15 min, swept and capped.
- Front pages: `/thumb/[id]` renders page 1 with `pdftoppm` (poppler-utils, `execFile`, timeout),
  cached in `DATA_DIR/thumbs/` keyed by path+mtime+size, in-flight dedupe, small concurrency cap.
- PDFs: `/pdf/[id]` streams with HTTP Range (206) and inline disposition; `?download=1` for attachment.
- Observability: `src/instrumentation.server.ts` (loaded before the app, never by `vite build`)
  calls `startTelemetry(process.env)` in `src/lib/server/observability/` (state on globalThis so the
  dev server's re-imports start nothing twice). Traces: `tracing.server` in `vite.config.ts`; the
  NodeSDK starts only when `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_TRACES_EXPORTER` is set (fs/dns/net
  instrumentation off); custom spans via `withSpan` in `trace.ts`. The app's own bundle is excluded
  from import-in-the-middle (wrapping it broke Kit's runtime: every request a 500). Metrics: our
  own MeterProvider + `PrometheusExporter({ preventServerStart: true })`, served by our own
  `node:http` server on `METRICS_PORT` (9464, `0` disables, busy port = warning) that checks the
  socket peer against `METRICS_ALLOW` CIDRs (`cidr.ts`, pure, never X-Forwarded-For); 404 for
  other paths, 403 for other sources. Instruments live in `metrics.ts` (API global, created
  lazily); labels stay low-cardinality (route id, never path/user/id/filename). OTel packages are
  `dependencies` (external in the bundle), so the image ships pruned `node_modules`; compose
  publishes 9464 on `${METRICS_BIND:-127.0.0.1}` only.

## Design

Newspaper / newsstand look, directed with the **design-taste-frontend** skill. Rules live in
[DESIGN.md](DESIGN.md), tokens (`--t-*`, light + dark values) in the `@theme` block of
`src/routes/layout.css`. Never hardcode colours in components. Front pages are the hero: the UI
around them stays quiet (paper tones, ink text, serif mastheads, tabular dates).

## Skills to use

Installed in `.claude/skills/` (git-ignored, third-party; sources in `skills-lock.json`,
reinstall with `npx skills add <source>`). `DESIGN.md` is the source of truth for tokens.

- **design-taste-frontend** (Taste) — art direction and anti-"AI slop" polish for every screen.
- **web-design-guidelines** — accessibility/UX audit before finishing a UI change.

## Container

Multi-stage `Containerfile` (node:24-slim + poppler-utils, runs as `node`, HEALTHCHECK on `/login`,
port 3000). `compose.yaml` mounts the shared folder read-only at `/newspapers` and a named volume
at `/data`; config in `.env` (see `.env.example`).

## CI/CD and release

- `.github/workflows/pipeline.yml` is the entry pipeline (pull requests, push to `main`, `vX.Y.Z`
  tags, with concurrency): job `test` calls the reusable `ci.yml` (also `workflow_dispatch`):
  Node from `.nvmrc`, `npm ci`, `poppler-utils`, lint, check, unit tests, build. On a `vX.Y.Z` tag
  that is on `main`, job `image` builds with `podman build --format docker` (keeps HEALTHCHECK) plus
  OCI labels, runs `scripts/smoke-image.sh` (synthetic editions, a CLI-made user, `/login`, a real
  login, `/thumb/<id>` as `image/jpeg`, `podman healthcheck run`, `:9464/metrics` with `newspaper_`
  series; logs on failure) and pushes `ghcr.io/<owner>/<repo>` tagged X.Y.Z / X.Y / latest; job
  `release` runs `gh release create --generate-notes`.
- Workflows cannot run locally: run `scripts/smoke-image.sh localhost/newspaper:smoke` after a
  local `podman build --format docker -t newspaper:smoke .` instead.

## Gotchas

- Node 24 (see `.nvmrc`).
- `pdftoppm` must be on PATH for front pages (`apt install poppler-utils`).
- Form POSTs over plain http: check login against `node build`, not only the dev server.
