# Feature: newspaper-viewer

## Objective
Password-protected web app that lists the newspaper PDFs of a shared folder, grouped by region,
shown as a mosaic of first-page thumbnails; clicking a cover opens the PDF.

## Decisions (defaults chosen by the orchestrator; user can override)
- Region is LOGICAL (user, 17/11/2026: all PDFs in one flat folder): `DATA_DIR/regions.json` maps
  regions to masthead patterns (seeded from a default with common Spanish regional papers);
  unmatched -> "National".
- Newsstand model: front page shows the latest edition of each masthead grouped by region, date
  selector for other days; `/paper/[slug]` lists back issues.
- Look: newspaper-like, directed by the design-taste-frontend skill (user request).
- Users = `data/users.json` (scrypt hashes, node:crypto, no DB); CLI `npm run user:add -- <name>`.
- Sessions = HMAC-signed httpOnly cookie (`SESSION_SECRET`), 7-day expiry.
- Thumbnails = `pdftoppm` first page -> JPEG, disk cache keyed by path+mtime+size.
- Stack = SvelteKit 3 + Svelte 5 runes + TS + Tailwind 4, adapter-node, container (poppler-utils).
- Dev fake folder: `./newspapers/` flat (git-ignored PDFs; user drops PDFs there).

## Tasks
- [x] T1 Scaffold SvelteKit project, git ignore, env config (route: delegated, writer trigger: 2+ files)
- [ ] T2 Auth: users file, scrypt, signed session, login/logout, guard hook, user CLI + tests
- [ ] T3 Library: flat scan, masthead/date parsing, regions.json mapping, editions by date, safe ids + tests
- [ ] T4 Thumbnails + PDF streaming endpoints (auth-guarded, traversal-safe) + tests
- [ ] T5 UI (taste skill): newspaper-like login + newsstand front page by region, date selector, region filter + search, paper archive page, DESIGN.md tokens
- [ ] T6 Containerfile/compose, README
- [x] T0 CLAUDE.md rewritten for this app (inline, parent); taste + web-design-guidelines skills copied to .claude/skills

## Checks
`npm run check`, `npm run lint`, `npm run test:unit -- --run`, `npm run build`.

## Progress / evidence
- Engram mirror: pending (no Engram tool available in parent session).
