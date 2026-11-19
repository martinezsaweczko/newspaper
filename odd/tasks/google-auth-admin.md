# Feature: google-auth-admin

## Objective
Google sign-in with self-registration that needs admin approval, an admin dashboard (approvals,
users, reading log: who opened which edition, when), and page/newspaper metrics + traces.
Backed by a local MySQL 8.4 container.

## Decisions (user, 19/11/2026)
- Google sign-in for everyone. The existing CLI username/password login stays as an
  **admin-only fallback** (users.json accounts are admins).
- New Google users land in `pending`; they cannot read until an admin approves. Admins can block.
- First admins: `ADMIN_EMAILS` (comma-separated) in `.env`: auto-approved, role admin; admins can
  promote/demote others in the dashboard.
- Reading log retained **forever** (explicit user choice). Show a short privacy notice (Spanish)
  on the pending page and the login page saying reading activity is recorded.
- DB: MySQL 8.4 container + Drizzle ORM + mysql2; migrations in `/drizzle`, applied automatically
  at startup; integration tests use throwaway `newspaper_test_*` databases and skip when MySQL is
  unreachable.
- Metrics labelled by newspaper slug / region / route, never by user or file; per-user detail lives
  only in the DB; spans carry user id + newspaper.
- Google prod needs https on a public domain (LAN IP / .local not accepted as redirect URI); dev
  works on `http://localhost:5173`. Secrets only in `.env` (`GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `PUBLIC_ORIGIN` or equivalent).

## Tasks
- [x] T1 MySQL in compose (dev + prod), Drizzle schema (users, reading_events), auto-migrate on
      start, test-DB helpers (route: delegated, writer A) — `14638dd`
- [x] T2 Google OIDC sign-in (state + PKCE + nonce, email_verified), session model covering
      google + local-admin accounts, revocation via session_version (writer A) — `994d782`
- [x] T3 Registration → pending page with privacy notice; admin approvals/users page; ADMIN_EMAILS
      bootstrap; guard: only approved users read, only admins see /admin (writer A) — `6e15df2`
- [ ] T4 Reading log: record edition opens (deduped against PDF Range requests), dashboard with
      filters (user, newspaper, date) (writer B)
- [ ] T5 Metrics + traces: page views, editions opened, front pages viewed by newspaper/region;
      user id + newspaper on spans (writer B)
- [ ] T6 CI with MySQL service, smoke test with DB, compose/README/CLAUDE.md (writer B)

## Checks
`npm run format`, `npm run lint`, `npm run check`, `npm run test:unit -- --run` (DB tests run
against the local MySQL container), `npm run build`, `node build` smoke with a fake OIDC provider.

## Delivery
Strategy: ask-on-risk. Forecast well above 400 lines, so the work is split into two writers
(T1–T3, then T4–T6) with work-unit commits per task on `feat/google-auth-admin`.

## Progress / evidence
- Branch `feat/google-auth-admin` cut from `feat/ui-should-improve` (275 tests green).
- Engram mirror: pending (no Engram tool in the parent session).
- Writer A (19/11/2026), T1–T3 on `feat/google-auth-admin`: `14638dd` feat(db), `994d782`
  feat(auth), `6e15df2` feat(admin), then a docs commit (README, CLAUDE.md, DESIGN.md, this file).
  - `npm run db:generate`: `drizzle/0000_init.sql` (2 tables, 3 indexes, 2 FKs); re-run: "No schema
    changes, nothing to migrate".
  - `npm run format` / `npm run lint` / `npm run check`: clean (0 errors, 0 warnings).
  - `npm run test:unit -- --run`: 22 files, 315 tests passed, 0 skipped (11 DB tests against the
    `db` container on 127.0.0.1:3307: migrations, Google registration/linking, admin actions).
  - `npm run build` (with `DATABASE_URL`): done; without it Kit fails with `env_invalid`, as
    intended (the Containerfile passes a placeholder; not baked into `build/`).
  - `node build` smoke (PORT 3140, throwaway DB, fake OIDC provider, playwright): 16/16 — new user
    → `/pendiente`; ADMIN_EMAILS user → `/`, approves; reader reads (front page `image/jpeg`); reader
    403 on `/admin`; block → reader signed out, next sign-in → `/bloqueado`; local admin login and
    `/admin/usuarios`; no self-block button; cross-site POST 403; callback without flow cookie →
    `/login?error=google`. SIGTERM now exits in ~1 s (the pool is closed on `sveltekit:shutdown`).
  - Dev DB container `newspaper-db-1` left running.

