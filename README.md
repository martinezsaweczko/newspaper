# NewsPaper

A private, password-protected newsstand. Point it at one shared folder full of newspaper PDFs and
it shows every edition as its rendered **front page** (never a file name), grouped by **region**,
one day at a time. Click a front page to read the PDF.

- **One flat folder.** All PDFs live together; the app only reads them.
- **Regions are logical.** A small `regions.json` maps mastheads to regions; anything unmatched is
  **Nacional**. Re-filing a paper means editing the mapping, never moving files.
- **A day at a time.** The stand opens on the most recent day up to today that has papers (an
  issue dated ahead, like a weekly magazine, is one "next day" away), with previous/next
  day, a list of every available day, a region filter and a search. Every masthead also has a
  back-issues page.
- **Fast front pages.** Page 1 is rendered once with `pdftoppm` and cached on disk.

SvelteKit 3 + Svelte 5 + Tailwind 4, Node adapter, shipped as a container. No database.

## Quick start (development)

Needs Node 24 and `pdftoppm` (`apt install poppler-utils`, `brew install poppler`).

```sh
npm install
node scripts/make-samples.mjs          # optional: 12 synthetic editions in ./newspapers
npm run user:add -- ana                # prompts for a password (no echo)
npm run dev                            # http://localhost:5173
```

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

- Patterns match **whole words** of the file name (without `.pdf`), ignoring case and accents:
  `cv` hides `CV_David.pdf` but not `Cvitae.pdf`; `acta de reunion` hides `Acta de reunión.pdf`.
- Ignored files are left out of the stand, the back issues and every count, and their `/pdf` and
  `/thumb` links answer 404. The files themselves are never touched.

## Configuration

| Variable                            | Default        | Meaning                                                                                                               |
| ----------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NEWSPAPER_DIR`                     | `./newspapers` | The shared flat folder of PDFs (read-only)                                                                            |
| `DATA_DIR`                          | `./data`       | `users.json`, `regions.json`, `ignore.json`, `thumbs/` (front-page cache)                                             |
| `SESSION_SECRET`                    | —              | Cookie signing key, **required in production** (32+ characters). Development falls back to a fixed key with a warning |
| `COOKIE_SECURE`                     | `false`        | `true` when served over https                                                                                         |
| `PORT`, `HOST`, `ADDRESS_HEADER`, … |                | [adapter-node options](https://svelte.dev/docs/kit/adapter-node)                                                      |

Variables are declared in `src/env.ts`; see `.env.example`.

## Users

Users live in `DATA_DIR/users.json` (scrypt hashes). There is no sign-up page.

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
cp .env.example .env            # set SESSION_SECRET, NEWSPAPER_HOST_DIR
podman build --format docker -t newspaper .    # or: docker build -t newspaper .
podman compose up -d                            # or: docker compose up -d
podman compose exec newspaper npm run user:add -- ana
```

`compose.yaml` mounts the host folder `NEWSPAPER_HOST_DIR` read-only at `/newspapers` and a named
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
  the root span `sveltekit.handle.root` carries `newspaper.user`. Custom spans:
  `newspaper.thumbnail.render` (`newspaper.masthead`, `newspaper.thumbnail.cache_hit`) and
  `newspaper.library.scan` (`newspaper.editions`). The NodeSDK only starts when an exporter is
  configured, so nothing is exported (and nothing is paid) by default. The fs, dns and net
  auto-instrumentations are off.
- **Metrics** (Prometheus text format) on a **separate port** with a source-address allowlist.

| Variable                            | Default             | Meaning                                                                                 |
| ----------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`       | —                   | OTLP/HTTP (protobuf) collector, e.g. `http://127.0.0.1:4318`. Setting it enables traces |
| `OTEL_TRACES_EXPORTER`              | —                   | `console`, `otlp` or `zipkin` instead; `none` disables traces                           |
| `OTEL_SERVICE_NAME`                 | `newspaper`         | Service name on traces and `target_info`                                                |
| other `OTEL_*`                      |                     | Standard SDK variables (headers, sampler, …)                                            |
| `METRICS_PORT`                      | `9464`              | Port of the `/metrics` server; `0` or empty disables it                                 |
| `METRICS_HOST`                      | `0.0.0.0`           | Interface it binds to                                                                   |
| `METRICS_ALLOW`                     | private ranges      | Comma-separated CIDRs allowed to scrape (see below)                                     |
| `METRICS_BIND`, `METRICS_HOST_PORT` | `127.0.0.1`, `9464` | compose only: host address and port that publish the container's 9464                   |

Exposed series (labels are low-cardinality: never usernames, ids or file names):

| Metric                                        | Type      | Labels                                                                                          |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `http_server_request_duration_seconds`        | histogram | `http_route` (route id, e.g. `/thumb/[id]`), `http_request_method`, `http_response_status_code` |
| `newspaper_thumbnail_renders_total`           | counter   | `result` = `hit` (disk cache), `miss` (rendered), `error`                                       |
| `newspaper_thumbnail_render_duration_seconds` | histogram | `result`                                                                                        |
| `newspaper_logins_total`                      | counter   | `result` = `success`, `failure`, `throttled`                                                    |
| `newspaper_editions`                          | gauge     | editions found by the last folder scan                                                          |
| `newspaper_pdf_bytes_sent_total`              | counter   | PDF bytes streamed                                                                              |

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
npm run test:unit -- --run
npm run build && node build
```

The design rules and tokens are in [DESIGN.md](DESIGN.md); project conventions in
[CLAUDE.md](CLAUDE.md).
