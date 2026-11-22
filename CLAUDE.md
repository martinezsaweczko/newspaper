# CLAUDE.md — NewsPaper (private newsstand)

A private web app (Google sign-in with admin approval) that turns a shared folder of newspaper PDFs into a newsstand:
every edition is shown as its rendered front page (never the filename), grouped by region,
and opens as a PDF on click.

SvelteKit 3 + Svelte 5 (runes) + TypeScript + Tailwind CSS 4. Node adapter, shipped as a container.
See README.md for the product overview, configuration and deploy.

## Commands

- `npm run dev` — dev server
- `npm run check` — svelte-check / types
- `npm run lint` / `npm run format` — prettier + eslint
- `npm run test:unit -- --run` — vitest
- `npm run coverage` — the same tests with a v8 coverage summary (`coverage/`, git-ignored)
- `npm run build` — production build to `build/` (`node build`)
- `npm run user:add -- <name>` / `npm run user:remove -- <name>` / `npm run user:logout-all -- <name>` — manage local admins (users.json, the fallback login)
- `npm run db:up` (`podman compose up -d db`) — the dev MySQL on 127.0.0.1:3307; `npm run dev` and the DB tests need it
- `npm run db:generate` — write a migration into `drizzle/` after changing `src/lib/server/db/schema.ts` (commit both)
- `npm run db:reset -- --yes` — dev only: drop every table of the loopback `DATABASE_URL` database
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

- **Shared folder** (`NEWSPAPER_DIR`, dev default `./newspapers`): PDFs at the top level and in
  subfolders up to `MAX_FOLDER_DEPTH` (4, `ids.ts`) deep. Subfolders (`nacional/`, `magazine/`…)
  are **storage only, never regions** and never part of the masthead. Read-only for the app.
  Hidden files and folders are skipped, symlinked folders never followed. `createScanner`
  (`scan.ts`) rescans when a folder mtime of the last scan changes or after 5 s, reusing the
  parsed editions whose path, size and mtime did not change.
- **Edition** = one PDF. Parsed from the filename: masthead (the newspaper) + optional date
  (`YYYY-MM-DD`, `YYYYMMDD`, `DD-MM-YYYY` anywhere; `DD-MM-YY`, `DD-MM`, `MM-YY` only at the start
  or end, never next to another number; falls back to file mtime). Year-less `DD-MM` takes the
  mtime's year, or the previous one if that lands >62 days after the mtime. A trailing copy marker
  (` (1)`, `_1`) is stripped; one edition per slug+date, across subfolders too (`dedupe.ts`: larger
  file, then original, then newest). The stand opens on the newest date up to today.
- **Ignore list**: `ignore.json` in `DATA_DIR` (created empty from `src/lib/server/ignore.default.json`,
  `{ "patterns": [] }`, reloaded on mtime change) hides non-newspaper PDFs; whole-word, case- and
  accent-insensitive match on the normalised file name only (never its folders). Ignored files are out of the stand, back
  issues and counts, and `resolveId` (`ignore` option, via `resolveEdition`) 404s them.
- **Region is logical, not a folder**: `regions.json` (in `DATA_DIR`, seeded from
  `src/lib/server/regions.default.json`) maps each region to masthead patterns, matched case- and
  accent-insensitively against the normalised filename. Unmatched mastheads are **Nacional** (`NATIONAL` in `regions.ts`; old `?region=National` links just show all).
  Changing a region = editing the mapping, never moving files.
- **Ids** are base64url of the `/`-separated relative path (`nacional/abc-2026-11-17.pdf`);
  `resolveId` rejects traversal and empty segments, absolute paths, backslashes, hidden segments,
  paths deeper than the limit, symlinked folders, non-PDF files, ignored files, symlinks leaving
  the root and missing files.

## Backend

- DB: MySQL 8.4 (compose `db` service) via Drizzle + mysql2. Schema `src/lib/server/db/schema.ts`
  (`users`, `reading_events`), migrations in `/drizzle` from `npm run db:generate`, applied by the
  `init` hook at start (after `waitForDb`), never during `vite build`. `DATABASE_URL` is required
  (Kit validates env at build time: the Containerfile builds with a placeholder that is not baked
  in). Pool on globalThis outside production (`getDbHandle`, no HMR leaks), `timezone: 'Z'`, all
  times DATETIME in UTC set by the app. DB tests use `createTestDb()` (`db/test-db.ts`): a
  throwaway `newspaper_test_<random>` via `TEST_DATABASE_ADMIN_URL` (default root on :3307), dropped
  after the suite; they skip when MySQL is unreachable.
- Google sign-in: OIDC code flow with PKCE S256 + state + nonce (`auth/oidc.ts`, `auth/google.ts`,
  `jose` JWKS), state/nonce/verifier in one signed 10-minute `np_oidc` cookie on `/auth/google`.
  The callback (a GET: state is its CSRF check) verifies iss/aud/exp/nonce, requires
  `email_verified`, then `signInGoogleUser` upserts by `google_sub` (links a pre-created row by
  email). New accounts are `pending`/`user`; `ADMIN_EMAILS` (case-insensitive, at creation only)
  makes them `approved`/`admin`. `/login` shows `GoogleButton.svelte` twice (sign in; register =
  `?intent=register`, whitelisted by `parseIntent`, sends `prompt=select_account`; sign-in sends
  no prompt). Off (routes 404; buttons hidden in production, disabled with a hint on the dev
  server: load's `google: 'on' | 'dev-off' | 'off'`) without `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` and `PUBLIC_ORIGIN`. `GOOGLE_ISSUER` points tests at `auth/fake-oidc.ts`.
  Sessions: `{k:'g', id, exp, v}` for Google (v = `users.session_version`) next to the local
  `{u, exp, v}`; `locals.user` is `CurrentUser` (`{ id, kind, email, name, role, status }`,
  `#lib/types.ts`) from `resolveUser` with a 5 s per-id cache (`user-cache.ts`) that admin actions
  invalidate. The guard is `decideAccess` (`auth/current.ts`): signed out → `/login`, pending →
  `/pendiente`, blocked → `/bloqueado`, only approved read, only admins reach `/admin/**` (403).
  Local users.json accounts are approved admins. Admin logic in `src/lib/server/admin/users.ts`
  (approve/block/unblock/promote/demote, and `deleteUser`; no self-block/demote/delete, never the
  last admin; block and role changes bump `session_version`; delete removes the row in a
  transaction, `reading_events` go by ON DELETE CASCADE, the cache entry is invalidated and the
  hook treats the missing user as signed out); `/admin/usuarios` only parses forms (delete needs
  the `?eliminar=<id>` confirm step and `confirm=si`).
- Auth: `DATA_DIR/users.json` with scrypt hashes (node:crypto, no auth deps), HMAC-signed session
  cookie (`SESSION_SECRET`, httpOnly, sameSite=lax, `COOKIE_SECURE` off by default for plain-http LAN).
  Tokens carry the user's `sessionVersion` (`v`; absent = 1 for pre-version tokens); a password
  change or `user:logout-all` bumps it, revoking every session. `hooks.server.ts` checks it via the
  cached `createUserDirectory` (stat per request, re-read on change) and guards every route except
  `/login`, `/auth/google/**` and static assets; `next` redirects are sanitised to same-site relative paths, checked
  after dot-segment normalisation. In-memory login throttle (`createLoginThrottle`): per IP+user 5,
  per user 10, per IP 50 failures / 15 min, swept and capped.
- Reading log: `src/lib/server/reading/log.ts` (pure over Drizzle). `/pdf/[id]` records an `open`
  (or `download`) for the first chunk only (no Range or `bytes=0-`), deduped per reader + edition
  + kind for 30 min (per-process TTL map set before the first await, SQL lookup as the fallback);
  failures never fail the PDF (warn once). Rows carry `user_id` (Google) or `local_username`
  (users.json admin), exactly one, enforced in code (MySQL forbids a CHECK on a cascading FK
  column). Kept forever (operator's choice; privacy notice on `/login` and `/pendiente`). The
  dashboard (`/admin` Resumen, `/admin/lecturas` with URL filters `usuario`/`periodico`/`region`/
  `desde`/`hasta` and 50 per page, `/admin/lecturas.csv`) is built by `reading/views.ts`; links
  via `#lib/admin-url.ts`. Times shown in server local time (`isoFromLocalDateTime`).
- Front pages: `/thumb/[id]` renders page 1 with `pdftoppm` (poppler-utils, `execFile`, timeout),
  cached in `DATA_DIR/thumbs/` keyed by path+mtime+size, in-flight dedupe, small concurrency cap.
- Legal pages: `/privacidad` (privacy policy) and `/condiciones` (terms) are public (`LEGAL_PATHS`
  in `auth/current.ts`, open to anonymous, pending and blocked visitors; `/privacidad/` and
  `/condiciones/` get a 308 to the bare path from `canonicalLegalPath` before the guard) for Google's consent
  screen. Text lives in the routes, frame in `LegalPage.svelte`, operator/contact from
  `LEGAL_OPERATOR_NAME` / `LEGAL_CONTACT_EMAIL` (`config.legal`). **Keep the text in sync with what
  the app actually stores** (schema, cookies, logs, metrics, traces) and bump its `UPDATED` date.
- PDFs: `/pdf/[id]` streams with HTTP Range (206) and inline disposition; `?download=1` for attachment.
- Reader: a front page opens `/leer/[id]` (the edition's masthead/date header + `PdfReader.svelte`),
  not the browser's PDF viewer. pdf.js (`pdfjs-dist`, imported in `onMount` only, worker via
  `?url`) loads `/pdf/[id]` in 1 MB Range chunks; a progress bar follows `onProgress`. Pages are
  canvases drawn only near the viewport and freed when they leave it; zoom keeps the reading
  position. Falls back to links to the browser viewer and the download if pdf.js fails. The first
  (no-Range) request still records the opening in the reading log.
- Observability: `src/instrumentation.server.ts` (loaded before the app, never by `vite build`)
  calls `startTelemetry(process.env)` in `src/lib/server/observability/` (state on globalThis so the
  dev server's re-imports start nothing twice). Traces: `tracing.server` in `vite.config.ts`; the
  NodeSDK starts only when `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_TRACES_EXPORTER` is set (fs/dns/net
  instrumentation off); custom spans via `withSpan` in `trace.ts`. Every exporter (`otlp`,
  `console`) is wrapped by `privateExporter` (`span-privacy.ts`), which strips client IPs
  (`client.address`, `network.peer.address`, `net.peer.ip`, `http.client_ip`,
  `http.request.header.*`) from all spans. The app's own bundle is excluded
  from import-in-the-middle (wrapping it broke Kit's runtime: every request a 500). Metrics: our
  own MeterProvider + `PrometheusExporter({ preventServerStart: true })`, served by our own
  `node:http` server on `METRICS_PORT` (9464, `0` disables, busy port = warning) that checks the
  socket peer against `METRICS_ALLOW` CIDRs (`cidr.ts`, pure, never X-Forwarded-For); 404 for
  other paths, 403 for other sources. Instruments live in `metrics.ts` (API global, created
  lazily); labels stay low-cardinality (route id, masthead slug, region; never path/user/email/
  id/filename). App series: `newspaper_page_views_total{route}` (2xx GET HTML pages and
  `__data.json` navigations), `newspaper_editions_opened_total{newspaper,region,kind}` (fed by the
  reading log's `onRecorded`, so it equals the log), `newspaper_front_pages_viewed_total
  {newspaper,region}` (200 only), gauges `newspaper_users{status}` and
  `newspaper_readers_active{window}` (DB via `cachedLoader`: one query per 60 s at most, failures
  included, 2 s scrape wait). Spans: root `newspaper.user.id` (users.id or `local:<name>`, never
  the email) + `newspaper.user.role`; `/pdf` and `/thumb` handler spans `newspaper.masthead`
  (slug), `newspaper.region`, `newspaper.edition_date`; `newspaper.reading.record` with `deduped`. OTel packages are
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
  Node from `.nvmrc`, `npm ci`, `poppler-utils`, a `mysql:8.4` service (health-checked, on :3307)
  with `DATABASE_URL` / `TEST_DATABASE_ADMIN_URL` and `REQUIRE_TEST_DB=1` (DB tests fail instead
  of skipping), a migration drift check (`npm run db:generate`, then `git status --porcelain --
  drizzle` must be empty, untracked files included), lint, check, unit tests with coverage (`npm run coverage`; the line total is the workflow's
  `coverage` output), build. On pushes to `main`, job `coverage-badge` writes `coverage.json` to the
  orphan `badges` branch for the README's Coverage badge. On a `vX.Y.Z`
  tag that is on `main`, job `image` builds with `podman build --format docker` (keeps
  HEALTHCHECK) plus OCI labels, runs `scripts/smoke-image.sh` (MySQL 8.4 + the app on a private
  podman network, PID-suffixed names, all removed after; tables from the auto-migrate via `SHOW
  TABLES`, `/login` without the Google button, `/auth/google` 404, a CLI-made local admin logs in,
  `/admin` 200, `/thumb/<id>` as `image/jpeg`, `/pdf/<id>` writes a `reading_events` row,
  `podman healthcheck run`, `:9464/metrics` with `newspaper_editions_opened_total`; logs on
  failure) and pushes `ghcr.io/<owner>/<repo>` tagged X.Y.Z / X.Y / latest; job
  `release` runs `gh release create --generate-notes`.
- Workflows cannot run locally: run `scripts/smoke-image.sh localhost/newspaper:smoke` after a
  local `podman build --format docker -t newspaper:smoke .` instead.

## Gotchas

- Node 24 (see `.nvmrc`).
- `pdftoppm` must be on PATH for front pages (`apt install poppler-utils`).
- Form POSTs over plain http: check login against `node build`, not only the dev server.
- `npm run dev`, `npm run build` and the DB tests need `DATABASE_URL` (in `.env`) and, for the
  first and last, the dev database running (`npm run db:up`). The host port is 3307, not 3306.
