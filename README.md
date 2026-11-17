# NewsPaper

A private, password-protected newsstand. Point it at one shared folder full of newspaper PDFs and
it shows every edition as its rendered **front page** (never a file name), grouped by **region**,
one day at a time. Click a front page to read the PDF.

- **One flat folder.** All PDFs live together; the app only reads them.
- **Regions are logical.** A small `regions.json` maps mastheads to regions; anything unmatched is
  **National**. Re-filing a paper means editing the mapping, never moving files.
- **A day at a time.** The stand opens on the most recent day that has papers, with previous/next
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
| `la-razon.pdf`                     | La Razon          | the file's modification date |

Accepted dates: `YYYY-MM-DD`, `YYYYMMDD`, `DD-MM-YYYY`, `DD_MM_YYYY`. Hidden files and anything
that is not a `.pdf` are ignored. If two files give the same masthead and day, the newest file wins.

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
- Unmatched mastheads go to **National**, which is always listed first; the other regions follow
  the order of the file.
- Avoid short, ambiguous patterns (a common word like `hoy` would catch unrelated titles).

## Configuration

| Variable                            | Default        | Meaning                                                                                                               |
| ----------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NEWSPAPER_DIR`                     | `./newspapers` | The shared flat folder of PDFs (read-only)                                                                            |
| `DATA_DIR`                          | `./data`       | `users.json`, `regions.json`, `thumbs/` (front-page cache)                                                            |
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
```

Sessions are signed, httpOnly cookies valid for 7 days. Failed logins are throttled per client
(5 attempts per 15 minutes).

## Deploy with a container

```sh
cp .env.example .env            # set SESSION_SECRET, NEWSPAPER_HOST_DIR
podman build --format docker -t newspaper .    # or: docker build -t newspaper .
podman compose up -d                            # or: docker compose up -d
podman compose exec newspaper npm run user:add -- ana
```

`compose.yaml` mounts the host folder `NEWSPAPER_HOST_DIR` read-only at `/newspapers` and a named
volume at `/data`, and publishes port 3000 (`NEWSPAPER_PORT`). The image is `node:24-slim` with
`poppler-utils`, runs as `node` and has a health check on `/login`.

Plain http on a LAN works as is (the CSRF check compares the Origin and Host headers ignoring the
scheme). Behind an https reverse proxy set `COOKIE_SECURE=true`.

## Development

```sh
npm run check            # types
npm run lint             # prettier + eslint (npm run format to fix)
npm run test:unit -- --run
npm run build && node build
```

The design rules and tokens are in [DESIGN.md](DESIGN.md); project conventions in
[CLAUDE.md](CLAUDE.md).
