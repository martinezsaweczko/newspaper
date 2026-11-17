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
- `npm run user:add -- <name>` / `npm run user:remove -- <name>` — manage logins
- `node scripts/make-samples.mjs` — generate synthetic sample editions into `newspapers/`
- `podman build -t newspaper .` (or docker) — container image; `podman compose up -d` — run it

## Conventions

- Svelte 5 runes only (`$state`, `$derived`, `$props`); no legacy `export let` / stores for local state.
- Import shared code via the `#lib/...` package import (SvelteKit 3 removed `$lib`).
- **European formats everywhere** (UI language stays English): dates `dd/mm/yyyy`, long dates
  `Tuesday, 17 November 2026`. `src/lib/format/date.ts` is the single source of truth: never call
  `Intl`/`toLocale*` or print a raw ISO date in a template. Dates travel as ISO `YYYY-MM-DD` (URLs).
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
  accent-insensitively against the normalised filename. Unmatched mastheads are **National**.
  Changing a region = editing the mapping, never moving files.
- **Ids** are base64url of the relative path; `resolveId` rejects traversal, absolute paths,
  non-PDF files, symlinks leaving the root and missing files.

## Backend

- Auth: `DATA_DIR/users.json` with scrypt hashes (node:crypto, no auth deps), HMAC-signed session
  cookie (`SESSION_SECRET`, httpOnly, sameSite=lax, `COOKIE_SECURE` off by default for plain-http LAN).
  `hooks.server.ts` guards every route except `/login` and static assets; `next` redirects are
  sanitised to same-site relative paths. In-memory login throttle.
- Front pages: `/thumb/[id]` renders page 1 with `pdftoppm` (poppler-utils, `execFile`, timeout),
  cached in `DATA_DIR/thumbs/` keyed by path+mtime+size, in-flight dedupe, small concurrency cap.
- PDFs: `/pdf/[id]` streams with HTTP Range (206) and inline disposition; `?download=1` for attachment.

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

## Gotchas

- Node 24 (see `.nvmrc`).
- `pdftoppm` must be on PATH for front pages (`apt install poppler-utils`).
- Form POSTs over plain http: check login against `node build`, not only the dev server.
