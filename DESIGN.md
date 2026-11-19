# DESIGN.md — NewsPaper ("The stand")

The source of truth for how the app looks. Tokens live in `src/routes/layout.css`; components use
only the Tailwind names mapped from them. Directed with the design-taste-frontend skill (app-screen
run, style **Achromatic ledger**, seed 1636931064), adapted to a newspaper.

## Idea

The app's chrome is a newspaper's top fold. The product name is set as a nameplate over a double
rule, the selected day is the dateline (`Martes, 17 de noviembre de 2026`, the page's `h1`; UI copy is Spanish), and every
region is a column head (a heavy ink rule, the region name, a count) standing over its shelf of
front pages. The front pages are the only pictures and the biggest thing on every screen; the
interface around them stays ink on newsprint.

## The one question per screen

| Screen            | Question                                  | Answered by                                          |
| ----------------- | ----------------------------------------- | ---------------------------------------------------- |
| `/`               | What is on the stand today?               | Front pages grouped by region, Nacional first        |
| `/paper/[slug]`   | What back issues of this paper are there? | Its front pages, newest first, with a download link  |
| `/login`          | Who are you?                              | The Google buttons, then the admin form              |
| `/pendiente`      | Can I read yet?                           | The pending notice, sign-out and the privacy notice  |
| `/privacidad`     | What does the stand keep about me?        | The privacy policy as one reading column             |
| `/condiciones`    | What may I do with the papers?            | The terms as one reading column                      |
| `/admin/usuarios` | Who is waiting to be let in?              | Accounts by status (Pendientes first) with actions   |
| `/admin`          | Who is reading what lately?               | Openings today / 7 / 30 days, top papers and readers |
| `/admin/lecturas` | Who opened which edition, and when?       | The filtered reading log, 50 per page, and its CSV   |

## Colour

Achromatic: no brand hue in the chrome. One ground, one ink, the ink as the primary action.

| Token          | Light      | Dark      | Use                                                     |
| -------------- | ---------- | --------- | ------------------------------------------------------- |
| `--t-paper`    | `#f3f2ef`  | `#141312` | Page ground (newsprint, low-chroma stone)               |
| `--t-sheet`    | `#fbfaf7`  | `#1c1b19` | Fields, the unavailable-front-page card                 |
| `--t-shelf`    | `#e8e6e0`  | `#24231f` | Front page while loading, hover on quiet links          |
| `--t-ink`      | `#141414`  | `#ecebe6` | Text, rules, the primary button                         |
| `--t-ink-soft` | `#5b5954`  | `#a6a39b` | Counts, secondary notes (4.5:1 or better)               |
| `--t-hairline` | `#d6d3cb`  | `#34322e` | Quiet separators                                        |
| `--t-control`  | `#a8a49a`  | `#6b6861` | Field borders (3:1 against the field)                   |
| `--t-on-ink`   | `#fafafa`  | `#141312` | Text on an ink fill                                     |
| `--t-signal`   | `#1d5fbf`  | `#7eaaf5` | The one hue: the focus ring                             |
| `--t-error`    | `#a3201c`  | `#ff8c84` | Login error text                                        |
| `--t-shadow`   | `20 18 12` | `0 0 0`   | RGB of the paper shadow                                 |
| `--t-page-dim` | `1`        | `0.9`     | Brightness of front pages (dimmed a little in the dark) |

Rules:

- Never hard-code a colour in a component; add a token with a light and a dark value instead.
  (`app.html` repeats `--t-paper` for `theme-color`; keep them in sync.)
- Colour stays under 1% of the screen: the focus ring only. The front pages bring their own.
  One exception, from the app-screen rules: on `/admin` the main data element (the bars of
  "Periódicos más leídos") carries `--t-signal`; everything else on the dashboard stays ink.
- Dark mode follows `prefers-color-scheme`; front pages stay printed paper, slightly dimmed.
- **Brand exception: the Google button.** `GoogleButton.svelte` follows Google's sign-in branding
  guidelines, which fix its colours, so they are taken as given rather than tuned to the stand:
  `--t-google-surface` `#ffffff` / `#131314`, `--t-google-border` `#747775` / `#8e918f`,
  `--t-google-text` `#1f1f1f` / `#e3e3e3` (light / dark), `--t-google-hover` (the text at 8% over
  the surface), and the four logo colours `--t-google-blue` `#4285f4`, `--t-google-green`
  `#34a853`, `--t-google-yellow` `#fbbc05`, `--t-google-red` `#ea4335` (same in both themes). The
  "G" is never recoloured, stretched or reused elsewhere, and these tokens are for that button only.

## Type

Two faces, both self-hosted from npm (`@fontsource-variable/*`), no external requests.

- **Newsreader** (serif, optical size axis): nameplate (800, opsz 72, tracking -0.035em), the
  dateline `h1` (600, 24-30px), region heads `h2` (600, 22-24px), masthead captions (600, 17px).
- **Geist** (sans): controls, counts and notes at 13-16px; `tabular-nums` on dates and counts.
- Sentence case everywhere. No tracked capitals, no eyebrows, no monospace.
- Fields are 16px on phones (no iOS zoom), 14px from `sm` up.

## Layout

- One centred column, max 1440px, 16px gutters on phones and 32px from `sm`.
- **The shelf grid** (`src/lib/components/shelf.ts`): 2 / 3 / 4 / 5 columns (base, `md`, `lg`,
  `xl`). A region spans as many columns as it has papers (capped per row) and lays its papers on a
  `subgrid`, so small regions stand side by side and every front page lines up with the others.
- Front pages are `32 / 45`, cropped from the top (`object-cover object-top`), square corners.
- Rules are ink and they are the newspaper's own: the nameplate's double rule (3px + 1px), the
  dateline's 1px rule, a 3px rule over every region head. No other lines except field borders.

## Components

- `Nameplate.svelte` — the wordmark and its double rule (`stand` size on app pages, `cover` on login).
- `SiteHeader.svelte` — skip link, "Private newsstand", the signed-in user, Administración (admins)
  and Sign out.
- `AccountNotice.svelte` — the page of an account that cannot read (pending, blocked).
- `PrivacyNotice.svelte` — the reading-log notice in small print (`/login`, `/pendiente`), linking
  to `/privacidad`. Under it, and in a small hairline footer on signed-in pages, "Política de
  privacidad · Condiciones del servicio" in 13px grey.
- `LegalPage.svelte` — the frame of `/privacidad` and `/condiciones`: the site header, one centred
  68ch column, the title in Newsreader (28-32px), "Última actualización: dd/mm/yyyy" over a 1px ink
  rule, Geist body at 16-17px / 1.65, section heads in Newsreader 22-24px, and a way back (stand,
  account notice or login, by session) beside the link to the other page.
- `FrontPage.svelte` — the front page linking to the PDF, alt text
  `"Portada de <Masthead>, dd/mm/yyyy"`, masthead caption linking to the back issues. On a render
  failure it becomes a sheet with the masthead set in Newsreader and "Front page unavailable".
- `AdminNav.svelte` — Resumen / Lecturas / Usuarios as underline tabs on one hairline; Usuarios
  carries the pending count as an ink pill.
- `ReadingTable.svelte` — the reading log rows (fecha y hora, lector, periódico, región, edición,
  tipo); a reader or newspaper links to the log filtered by it; below `md` each row folds into
  two lines under the reader.
- Dashboard (`/admin`): the KPI strip is one container split by hairlines into three columns
  (Hoy / Últimos 7 días / Últimos 30 días), figures in Newsreader, no tiles or icons; section heads
  reuse the region head (3px ink rule, serif `h2`) with the period right-aligned in grey.
- `GoogleButton.svelte` — the standard Google button (the 20px four-colour "G", 12px gap, the
  label in Geist 500 since Roboto is not shipped, 48px tall, 6px radius, full width), used on
  `/login` for "Iniciar sesión con Google" and, under "¿No tienes cuenta?", "Registrarse con
  Google" (`?intent=register` asks Google for its account chooser). An "o" between two hairlines
  separates them from the "Acceso de administración" disclosure. Unconfigured on the dev server,
  both show disabled with a hint naming the missing `.env` keys; unconfigured in production they
  are not rendered.
- Buttons: one style, ink fill, 6px radius, 44-48px tall. Quiet actions are text links. The Google
  button is the one exception (above).

## Depth and motion

- Front pages carry a soft paper shadow (the one exception to "no shadows at rest": they are the
  physical objects on the stand) and lift 3px on hover and keyboard focus.
- Nothing performs an entrance. `prefers-reduced-motion` drops the lift.

## Accessibility

- Visible 3px focus ring in `--t-signal`, offset from the element.
- Every control has a label (visually hidden where the form is self-evident), touch targets are
  44px, the result count is announced in a polite live region. A login error is tied to both fields
  (`aria-describedby="login-error"`, `aria-invalid`) and focus returns to the password when the
  username came back filled, else to the username (`autofocus`, so it works without JS).
- Dates are written through `src/lib/format/date.ts` only.
- Counts are written through `src/lib/format/count.ts`: an edition is always a **portada** in a
  count (stand header, region heads, back issues; "periódico" names the masthead). Filtered, the
  header counts the visible set against the day (`3 de 35 portadas · Catalunya · «voz»`) with the
  "Ver todas" reset link beside it.
