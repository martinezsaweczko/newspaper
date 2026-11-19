# NewsPaper

A private newsstand behind Google sign-in and admin approval. Point it at one shared folder full of newspaper PDFs and
it shows every edition as its rendered **front page** (never a file name), grouped by **region**,
one day at a time. Click a front page to read the PDF.

- **One shared folder.** PDFs at the top level or in subfolders (up to 4 levels deep); the app
  only reads them. Subfolders are storage only: they never become regions.
- **Regions are logical.** A small `regions.json` maps mastheads to regions; anything unmatched is
  **Nacional**. Re-filing a paper means editing the mapping, never moving files, and a
  `nacional/` or `magazine/` subfolder says nothing about the region.
- **A day at a time.** The stand opens on the most recent day up to today that has papers (an
  issue dated ahead, like a weekly magazine, is one "next day" away), with previous/next
  day, a list of every available day, a region filter and a search. Every masthead also has a
  back-issues page.
- **Fast front pages.** Page 1 is rendered once with `pdftoppm` and cached on disk.
- **Sign in with Google, then wait for approval.** New accounts are pending until an admin
  approves them; admins can block, delete and promote accounts. A users.json login remains as an
  admin-only fallback. Reading activity (which papers, when) is recorded and kept.

SvelteKit 3 + Svelte 5 + Tailwind 4, Node adapter, MySQL 8.4 (Drizzle), shipped as a container.

## Quick start (development)

Needs Node 24, `pdftoppm` (`apt install poppler-utils`, `brew install poppler`) and podman (or
docker) for the database.

```sh
npm install
cp .env.example .env                   # DATABASE_URL already points at the dev database
npm run db:up                          # podman compose up -d db: MySQL 8.4 on 127.0.0.1:3307
node scripts/make-samples.mjs          # optional: 12 synthetic editions in ./newspapers
npm run user:add -- ana                # a local admin; prompts for a password (no echo)
npm run dev                            # http://localhost:5173 (migrates the database on start)
```

The dev database listens on host port 3307 so it never clashes with another MySQL on 3306. It
keeps running in the background; `podman compose stop db` stops it. Migrations in `drizzle/` are
applied automatically when the server starts. Without Google configured, `/login` offers only the
local admin form (the dev server shows the Google buttons disabled, with a hint naming the missing
`.env` keys); see [Google sign-in](#google-sign-in) to turn them on.

Drop real PDFs into `./newspapers` (git-ignored) or point `NEWSPAPER_DIR` elsewhere.

### File names

The masthead and the date come from the file name; separators (`-`, `_`, `.`, spaces) are
interchangeable and the masthead is title-cased for display.

| File                               | Masthead          | Date                         |
| ---------------------------------- | ----------------- | ---------------------------- |
| `la-voz-de-galicia-2026-11-17.pdf` | La Voz de Galicia | 17/11/2026                   |
| `El_Correo_20261117.pdf`           | El Correo         | 17/11/2026                   |
| `diario de sevilla 17-11-2026.pdf` | Diario de Sevilla | 17/11/2026                   |
| `heraldo_de_aragon_17_11_2026.pdf` | Heraldo de Aragon | 17/11/2026                   |
| `06-10-26-Diario de Ferrol.pdf`    | Diario de Ferrol  | 06/10/2026                   |
| `08-11-26-El Pais Semanal.pdf`     | El Pais Semanal   | 08/11/2026                   |
| `25-11 Hola (1).pdf`               | Hola              | 25/11 of the mtime's year    |
| `10-26-Icon EP.pdf`                | Icon EP           | 01/10/2026 (a monthly)       |
| `la-razon.pdf`                     | La Razon          | the file's modification date |

Accepted dates: `YYYY-MM-DD`, `YYYYMMDD`, `DD-MM-YYYY` anywhere in the name, and the short forms
`DD-MM-YY` (20YY), `DD-MM` and `MM-YY` (monthlies, dated the 1st) at the start or the end of the
name, with `-`, `_`, `.` or a space between the numbers. A short form never touches a masthead
number such as `Canarias7`, `20 Minutos` or `Las 24 Horas`.

- **`DD-MM` without a year** takes the year of the file's modification time, or the year before
  when that would put the edition more than 62 days after the file was written (a `25-11` issue
  saved in January is last November's).
- **Two numbers** are read as `DD-MM` when the second can be a month (`25-11`), otherwise as
  `MM-YY` when 20YY is within five years of the file's (`10-26`).
- The first word of the masthead is always capitalised, small words (`de`, `la`, `el`…) stay lower
  case elsewhere, and accents are kept exactly as written.
- **Copies.** A trailing copy marker (` (1)`, `(2)`, `_1`) is dropped from the masthead. Files that
  give the same masthead and day are one edition and only one is listed: the **larger** file (a
  truncated download loses), then the original without a marker, then the most recently modified.

Hidden files and anything that is not a `.pdf` are skipped, and so is anything on the ignore list.

### Subfolders

The shared folder may be organised in subfolders, e.g. `nacional/`, `internacional/`,
`magazine/`. PDFs are read at any depth up to four folders below `NEWSPAPER_DIR`
(`a/b/c/d/x.pdf`); deeper files are not listed.

- Folders are **storage only**: they never set the region (that is `regions.json`) and never
  become part of the masthead, which comes from the file name alone.
- The same masthead and day in two folders is **one edition**, chosen by the copy rule above.
- Hidden folders (`.name`) are skipped and symlinked folders are never followed, so a link loop
  or a link out of the share cannot be listed.
- The ignore list matches the **file name** only, not its folders.
- New files show up on the next request: the app rescans when any folder's modification time
  changes, and at least every 5 s otherwise, re-parsing only new or changed files.

## Regions (`regions.json`)

On first start the app copies `src/lib/server/regions.default.json` to `DATA_DIR/regions.json`
(well-known Spanish regional papers). From then on it reads only `DATA_DIR/regions.json`, and
picks up edits on the next request (it watches the file's modification time). A broken edit is
logged and the last good mapping stays in use.

```json
{
	"regions": [
		{ "name": "Galicia", "match": ["la voz de galicia", "faro de vigo", "el correo gallego"] },
		{ "name": "País Vasco", "match": ["el correo", "diario vasco"] }
	]
}
```

- Patterns match **whole words** of the masthead, ignoring case and accents: `sur` matches
  "Diario Sur" but not "Surf"; `heraldo de aragon` matches "Heraldo de Aragón".
- The **longest** matching pattern wins across all regions, so `el correo gallego` (Galicia) beats
  `el correo` (País Vasco).
- Unmatched mastheads go to **Nacional**, which is always listed first; the other regions follow
  the order of the file.
- Avoid short, ambiguous patterns (a common word like `hoy` would catch unrelated titles).

## Ignore list (`ignore.json`)

PDFs that are not newspapers (a CV, meeting minutes, a manual) can share the folder. On first start
the app creates an empty `DATA_DIR/ignore.json` and, like `regions.json`, picks up edits on the next
request; a broken edit is logged and the last good list stays in use.

```json
{ "patterns": ["curriculum", "cv", "acta de reunion"] }
```

- Patterns match **whole words** of the file name (without `.pdf` and without its folders),
  ignoring case and accents:
  `cv` hides `CV_David.pdf` but not `Cvitae.pdf`; `acta de reunion` hides `Acta de reunión.pdf`.
- Ignored files are left out of the stand, the back issues and every count, and their `/pdf` and
  `/thumb` links answer 404. The files themselves are never touched.

## Configuration

| Variable                            | Default        | Meaning                                                                                                               |
| ----------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NEWSPAPER_DIR`                     | `./newspapers` | The shared folder of PDFs, subfolders included (read-only)                                                            |
| `DATA_DIR`                          | `./data`       | `users.json`, `regions.json`, `ignore.json`, `thumbs/` (front-page cache)                                             |
| `SESSION_SECRET`                    | —              | Cookie signing key, **required in production** (32+ characters). Development falls back to a fixed key with a warning |
| `COOKIE_SECURE`                     | `false`        | `true` when served over https                                                                                         |
| `DATABASE_URL`                      | —              | **Required.** `mysql://user:pass@host:port/db`; dev `mysql://newspaper:newspaper@127.0.0.1:3307/newspaper`            |
| `GOOGLE_CLIENT_ID`                  | —              | Google OAuth client id. Google sign-in is off unless id, secret and `PUBLIC_ORIGIN` are set                           |
| `GOOGLE_CLIENT_SECRET`              | —              | Google OAuth client secret                                                                                            |
| `PUBLIC_ORIGIN`                     | —              | The origin people use, e.g. `https://news.example.com`; the redirect URI is `<origin>/auth/google/callback`           |
| `ADMIN_EMAILS`                      | —              | Comma-separated emails that become approved admins when their account is created                                      |
| `GOOGLE_ISSUER`                     | Google         | Testing only: another OpenID issuer (the tests use a fake one)                                                        |
| `LEGAL_OPERATOR_NAME`               | —              | Who runs the stand, named as data controller on `/privacidad` and `/condiciones` (default: a generic wording)         |
| `LEGAL_CONTACT_EMAIL`               | first admin    | Address for privacy requests on the legal pages; defaults to the first `ADMIN_EMAILS` address, else none shown        |
| `TEST_DATABASE_ADMIN_URL`           | root on :3307  | Tests: the account that creates throwaway `newspaper_test_*` databases                                                |
| `PORT`, `HOST`, `ADDRESS_HEADER`, … |                | [adapter-node options](https://svelte.dev/docs/kit/adapter-node)                                                      |

Variables are declared in `src/env.ts`; see `.env.example`.

## Google sign-in

Everyone signs in with Google: `/login` shows the standard "Iniciar sesión con Google" button and,
under "¿No tienes cuenta?", "Registrarse con Google". Both run the same flow; registering asks
Google for its account chooser (`/auth/google?intent=register` → `prompt=select_account`), so
people can pick the right account. A new account is **pending**: it sees a "pendiente de aprobación"
page (with the privacy notice) until an admin approves it at **Administración → Usuarios**
(`/admin/usuarios`), where admins also block and unblock accounts and make or remove other
admins. Blocking or a role change signs the account out at once. Admins cannot block or demote
themselves, and the last admin cannot be removed.

**Deleting an account** (a privacy request, or a stale one): "Eliminar cuenta" on the row asks
"¿Seguro? Se borrarán la cuenta y todo su historial de lectura." and only "Eliminar
definitivamente" deletes it (the step lives in the URL, `?eliminar=<id>`, so it works without
JavaScript; the form carries `confirm=si`). The users row goes, and its reading history with it
(`reading_events` cascades on delete); any open session ends on its next request, because the
account no longer exists. Admins cannot delete themselves or the last approved admin. Cached front
pages are not personal data and stay. The same Google account can register again later and starts
as pending.

`ADMIN_EMAILS` bootstraps the first admins: an address in it (any case) becomes an approved admin
when its account is created on the first Google sign-in. It is not re-applied later, so a demotion
in the dashboard sticks. The local users.json accounts below are always admins.

### Setting up the Google OAuth client

1. In the [Google Cloud console](https://console.cloud.google.com/), create (or pick) a project.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding/Audience): user type
   **External**, the app name and a support email. Scopes: `openid`, `email` and `profile` (no
   sensitive scopes, so no verification is needed). While the app is in **Testing**, only the
   test users you list can sign in; **Publish** it to let any Google account request access
   (approval in the app still applies).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web
   application**. Add the authorised redirect URIs, exactly:
   - `http://localhost:5173/auth/google/callback` for `npm run dev`;
   - `https://news.example.com/auth/google/callback` for production (your domain).
     No JavaScript origins are needed (the flow is server side).
4. Put the client id and secret in `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, set
   `PUBLIC_ORIGIN` to the matching origin (`http://localhost:5173`, or the https production one)
   and `ADMIN_EMAILS` to your own address, then restart.

Production needs **https on a public domain**: Google accepts `http` redirect URIs only for
`localhost`, and rejects private IPs and `.local` names. On a LAN, put the app behind a reverse
proxy with a real certificate for a public name (it may resolve to the LAN address), and set
`COOKIE_SECURE=true`. The flow is OpenID Connect with PKCE (S256), `state` and `nonce`; the ID
token's signature, issuer, audience, expiry and nonce are checked and a verified email is required.

### Google consent screen (Branding)

The consent screen's **Branding** page asks for public URLs. The app serves two public pages,
reachable without signing in (and by any account, even pending or blocked):

- Application home page: `https://<domain>/`
- Application privacy policy link: `https://<domain>/privacidad` (Política de privacidad)
- Application terms of service link: `https://<domain>/condiciones` (Condiciones del servicio)

Their **authorized domain** must be a verified public domain you own (Google Search Console);
`localhost` and LAN addresses are not accepted, so leave these fields empty while the app is in
**Testing** and fill them in when it has its public https domain. Set `LEGAL_OPERATOR_NAME` and
`LEGAL_CONTACT_EMAIL` so the pages name who runs the stand and where privacy requests go (without
them they say "el administrador de este quiosco" and use the first `ADMIN_EMAILS` address). The
texts are a plain template describing what the app stores, not legal advice.

## Reading log and dashboard

Every time a reader opens an edition (or downloads it with `?download=1`) the app writes one row
to the `reading_events` table: who (the Google account, or `local_username` for a local admin),
which edition (file path, newspaper slug, region, edition date), open or download, and when. A
PDF viewer fetches a file in many Range chunks; only the first one (no Range, or a Range from
byte 0) counts, and the same reader + edition + kind is recorded once per 30 minutes. A database
failure never breaks the PDF; it is logged once as a warning.

Admins see it under **Administración**:

- **Resumen** (`/admin`): openings, active readers and newspapers read today, in the last 7 and 30
  days; the most read newspapers and the most active readers (30 days); the 20 latest openings;
  and a "Pendientes: N" link when accounts are waiting for approval.
- **Lecturas** (`/admin/lecturas`): the whole log, 50 per page, filtered in the URL by `usuario`
  (an account id, or `local:<name>`), `periodico` (slug), `region`, and `desde`/`hasta` (typed as
  `dd/mm/aaaa`). Clicking a reader or a newspaper anywhere filters by it. **Descargar CSV**
  (`/admin/lecturas.csv`, same filters) exports it for a spreadsheet (`;`-separated, UTF-8).
- **Usuarios** (`/admin/usuarios`): approvals and accounts (above).

**Privacy.** The reading log is kept indefinitely, by the operator's choice: there is no
automatic deletion. Under the GDPR, people must be told their reading activity is recorded; the
notice is shown on `/login` and on the pending page. Deleting a Google account's `users` row
deletes its reading rows too (`ON DELETE CASCADE`). Metrics never carry who read what (see
Observability).

## Local admins (users.json)

The fallback login, under "Acceso de administración" on `/login`, for when Google is not
configured or not reachable. Accounts live in `DATA_DIR/users.json` (scrypt hashes) and are admins.

```sh
npm run user:add -- ana                     # create, or change ana's password (prompted)
npm run user:add -- ana --password '…'      # non-interactive
npm run user:remove -- ana                  # sessions of a removed user stop working at once
npm run user:logout-all -- ana              # sign ana out of every browser
```

Sessions are signed, httpOnly cookies valid for 7 days. Each token carries the user's
`sessionVersion` from `users.json`; changing a password or running `user:logout-all` bumps it, so
every existing session of that user stops working on its next request (no restart needed).
Cookies issued before session versions existed count as version 1 and keep working until then. Failed logins are throttled in memory over
a 15-minute window: 5 failures per client address + username, 10 per username from any address,
and 50 per client address across all usernames (slows password spraying without one person's typos
locking out everyone behind the same NAT). A successful login clears that user's counters.

Behind a reverse proxy, set `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH` to the number of
trusted proxies in front of the app (adapter-node, default 1); otherwise the throttle sees the
proxy's address, or a client-spoofed one.

## Deploy with a container

```sh
cp .env.example .env            # SESSION_SECRET, NEWSPAPER_HOST_DIR, MYSQL_*PASSWORD, GOOGLE_*, PUBLIC_ORIGIN, ADMIN_EMAILS
podman build --format docker -t newspaper .    # or: docker build -t newspaper .
podman compose up -d                            # db first (healthy), then the app
podman compose exec newspaper npm run user:add -- ana   # optional local admin
```

`compose.yaml` runs two services. `db` is MySQL 8.4 with the named volume `newspaper-db`,
published on `127.0.0.1:3307` only (for development and a local client; delete the line on a
server that does not need it). Set `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` before the first
start: they are fixed when the volume is created. `newspaper` starts once the database is healthy,
reaches it as `db:3306` (compose sets its `DATABASE_URL`) and applies pending migrations on start.
It mounts the host folder `NEWSPAPER_HOST_DIR` read-only at `/newspapers` and a named
volume at `/data`, and publishes port 3000 (`NEWSPAPER_PORT`) plus the metrics port 9464 on
`127.0.0.1` only (see [Observability](#observability)). The image is `node:24-slim` with
`poppler-utils`, runs as `node` and has a health check on `/login`.

Plain http on a LAN works as is (the CSRF check compares the Origin and Host headers ignoring the
scheme). Behind an https reverse proxy set `COOKIE_SECURE=true`.

## Observability

Two independent parts, both started from `src/instrumentation.server.ts` (which SvelteKit loads
before the app; `vite build` never runs it):

- **Traces** (OpenTelemetry, following the
  [SvelteKit observability docs](https://svelte.dev/docs/kit/observability)): SvelteKit emits spans
  for `handle`, `load`, form actions and `+server` handlers (`tracing.server` in `vite.config.ts`);
  the root span `sveltekit.handle.root` carries `newspaper.user.id` (the account's `users.id`, or
  `local:<name>` for a local admin; never the email) and `newspaper.user.role`. The `/pdf` and
  `/thumb` handler spans carry `newspaper.masthead` (the slug), `newspaper.region` and
  `newspaper.edition_date`. Custom spans: `newspaper.thumbnail.render` (the same edition
  attributes plus `newspaper.thumbnail.cache_hit`), `newspaper.reading.record` around the reading
  log insert (`deduped` = true when the opening was already recorded in the last 30 minutes) and
  `newspaper.library.scan` (`newspaper.editions`). The NodeSDK only starts when an exporter is
  configured, so nothing is exported (and nothing is paid) by default. The fs, dns and net
  auto-instrumentations are off. **No client IP address is exported**: every exporter sits behind
  a scrubber (`src/lib/server/observability/span-privacy.ts`) that drops `client.address`,
  `network.peer.address`, `net.peer.ip`, `http.client_ip` (X-Forwarded-For) and the like, and any
  captured request header, from every span; no request header is captured anyway.
- **Metrics** (Prometheus text format) on a **separate port** with a source-address allowlist.

| Variable                            | Default             | Meaning                                                                                 |
| ----------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`       | —                   | OTLP/HTTP (protobuf) collector, e.g. `http://127.0.0.1:4318`. Setting it enables traces |
| `OTEL_TRACES_EXPORTER`              | —                   | `otlp`, `console` or both (`otlp,console`); `none` disables traces                      |
| `OTEL_SERVICE_NAME`                 | `newspaper`         | Service name on traces and `target_info`                                                |
| other `OTEL_*`                      |                     | Standard SDK variables (headers, sampler, …)                                            |
| `METRICS_PORT`                      | `9464`              | Port of the `/metrics` server; `0` or empty disables it                                 |
| `METRICS_HOST`                      | `0.0.0.0`           | Interface it binds to                                                                   |
| `METRICS_ALLOW`                     | private ranges      | Comma-separated CIDRs allowed to scrape (see below)                                     |
| `METRICS_BIND`, `METRICS_HOST_PORT` | `127.0.0.1`, `9464` | compose only: host address and port that publish the container's 9464                   |

Exposed series (labels are low-cardinality: never users, emails, ids or file names;
`newspaper` is the masthead slug, bounded by the mastheads in the folder):

| Metric                                        | Type      | Labels                                                                                          |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `http_server_request_duration_seconds`        | histogram | `http_route` (route id, e.g. `/thumb/[id]`), `http_request_method`, `http_response_status_code` |
| `newspaper_thumbnail_renders_total`           | counter   | `result` = `hit` (disk cache), `miss` (rendered), `error`                                       |
| `newspaper_thumbnail_render_duration_seconds` | histogram | `result`                                                                                        |
| `newspaper_logins_total`                      | counter   | `result` = `success`, `failure`, `throttled`                                                    |
| `newspaper_editions`                          | gauge     | editions found by the last folder scan                                                          |
| `newspaper_pdf_bytes_sent_total`              | counter   | PDF bytes streamed                                                                              |
| `newspaper_page_views_total`                  | counter   | `route` (route id): 2xx GETs of HTML pages and their client-side navigations (`__data.json`)    |
| `newspaper_editions_opened_total`             | counter   | `newspaper`, `region`, `kind` = `open`, `download`; the rows the reading log records (deduped)  |
| `newspaper_front_pages_viewed_total`          | counter   | `newspaper`, `region`: front pages served with 200 (cache hits and fresh renders)               |
| `newspaper_users`                             | gauge     | `status` = `pending`, `approved`, `blocked` (Google accounts)                                   |
| `newspaper_readers_active`                    | gauge     | `window` = `1d`, `7d`, `30d`: distinct readers with an opening in the window                    |

The two gauges come from the database through a cached query: at most one every 60 s (a failed one
counts too, so a down database is not queried on every scrape), and a scrape waits at most 2 s for
it before answering with the last values.

Example PromQL, top newspapers over 7 days:

```promql
topk(10, sum by (newspaper)(increase(newspaper_editions_opened_total[7d])))
```

Per-user detail (who read what, when) is never a metric or a label: it lives only in the database
and is shown in the admin dashboard (`/admin`, `/admin/lecturas`).

### LAN only

`/metrics` is never served on the app port, so the reverse proxy in front of the app cannot expose
it. The metrics server answers only `GET|HEAD /metrics` (anything else is 404) and only to a
**socket peer address** inside `METRICS_ALLOW` (anything else is 403; `X-Forwarded-For` is never
read). The default allowlist is loopback plus the private and link-local ranges:
`127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128,fc00::/7,fe80::/10`; IPv4-mapped IPv6
peers (`::ffff:192.168.1.5`) are matched as IPv4. Narrow it to your Prometheus host when you can
(`METRICS_ALLOW=192.168.1.20/32`).

Keep the port off public interfaces: in compose it is published on `127.0.0.1` by default. For a
Prometheus elsewhere on the LAN set `METRICS_BIND` to this machine's LAN IP (e.g.
`192.168.1.10`); for a Prometheus container on the same compose network, remove the metrics
`ports:` line and scrape `newspaper:9464`. Never forward 9464 on the router or route it through the
reverse proxy. A busy port only logs a warning, so a second `npm run dev` still starts.

Prometheus `scrape_config`:

```yaml
scrape_configs:
  - job_name: newspaper
    metrics_path: /metrics
    static_configs:
      - targets: ['192.168.1.10:9464'] # or newspaper:9464 on the compose network
```

### Traces quickstart (Jaeger)

```sh
podman run -d --name jaeger -p 16686:16686 -p 4318:4318 docker.io/jaegertracing/all-in-one:latest
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 node build   # after npm run build
# open http://127.0.0.1:16686 and pick the "newspaper" service
```

Without a collector, `OTEL_TRACES_EXPORTER=console node build` prints the spans to stdout. Tracing
has a cost; turn it on when you need it.

## Development

```sh
npm run check            # types
npm run lint             # prettier + eslint (npm run format to fix)
npm run test:unit -- --run   # DB tests need `npm run db:up` (they skip when MySQL is down)
npm run build && node build  # both need DATABASE_URL (from .env)
npm run db:generate          # after editing src/lib/server/db/schema.ts: writes drizzle/NNNN_*.sql
npm run db:reset -- --yes    # dev only: drop every table of the loopback DATABASE_URL database
```

Tests never need Google: `src/lib/server/auth/fake-oidc.ts` is a local OpenID provider that signs
RS256 tokens with its own JWKS, and `GOOGLE_ISSUER` can point a running server at it.

The design rules and tokens are in [DESIGN.md](DESIGN.md); project conventions in
[CLAUDE.md](CLAUDE.md).
