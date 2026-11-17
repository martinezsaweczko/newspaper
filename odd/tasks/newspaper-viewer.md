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
- [x] T2 Auth: users file, scrypt, signed session, login/logout, guard hook, user CLI + tests
- [x] T3 Library: flat scan, masthead/date parsing, regions.json mapping, editions by date, safe ids + tests
- [x] T4 Thumbnails + PDF streaming endpoints (auth-guarded, traversal-safe) + tests
- [x] T5 UI (taste skill): newspaper-like login + newsstand front page by region, date selector, region filter + search, paper archive page, DESIGN.md tokens
- [x] T6 Containerfile/compose, README
- [x] T0 CLAUDE.md rewritten for this app (inline, parent); taste + web-design-guidelines skills copied to .claude/skills

## Checks
`npm run check`, `npm run lint`, `npm run test:unit -- --run`, `npm run build`.

## Progress / evidence
- Engram mirror: pending (no Engram tool available in parent session or writer).
- Route: all of T1-T6 delegated to one writer (writer trigger: 2+ non-trivial files).
- Commits on `feat/newspaper-viewer`:
  - T1 `6d3154c` chore: scaffold SvelteKit 3 app with env config
  - T2 `45f34a2` feat(auth): users file, signed sessions, login guard and user CLI
  - T3+T4 `0ba14e8` feat(library): flat-folder editions, logical regions, front pages and PDF streaming
  - T5 `8afd79d` feat(ui): newspaper-style newsstand, back issues and login
  - `3d1e1a0` style: apply prettier and eslint fixes to server modules
  - T6 `7f5e2c9` build: container image, compose stack and README
- Checks (final tree): `npm run format` ok; `npm run lint` exit 0; `npm run check` 0 errors /
  0 warnings; `npm run test:unit -- --run` 10 files, 118 tests passed (thumbnail spec ran real
  pdftoppm); `npm run build` ok.
- Smoke (`node build`, PORT=3123, scratch DATA_DIR): `/` -> 303 /login; login POST with matching
  Origin -> 303 + session cookie; foreign Origin -> 403; `/` with cookie shows 17/11/2026 with
  National, Andalucía, Aragón, Catalunya, Galicia, País Vasco; `/thumb/<id>` 200 image/jpeg (ETag
  304 on revalidation); `/pdf/<id>` with Range 206; traversal ids 404; regions.json seeded.
- Look pass: taste inspector `--app` on `/` 0 FAIL / 0 WARN at 1440/768/390; `/login` and
  `/paper/[slug]` 0 FAIL (title-size and void warnings addressed or data-limited); dark mode and
  the broken-PDF placeholder checked with headless Chrome screenshots.
- Test-first note: specs were written together with each module and run before the endpoints and UI
  consumed them; no separate RED run was recorded.
- Not run: container image build (needs Debian mirrors for poppler-utils; network limited to npm),
  Playwright e2e (skipped by brief), web-design-guidelines fetch (GitHub not reachable by policy;
  audit done against the known guideline set).

## Next step
User review; optional native review of the work-unit commits; then push/PR (human decision).
