# Shared folder (development)

This is the development stand-in for the shared newspaper folder (`NEWSPAPER_DIR`, default
`./newspapers`). Drop PDFs here, all in this one flat folder; the app only reads them.

- File names give the masthead and the date: `la-voz-de-galicia-2026-11-17.pdf`,
  `El_Correo_20261117.pdf`, `diario de sevilla 17-11-2026.pdf`. Without a date the file's
  modification date is used.
- The region comes from `DATA_DIR/regions.json`, never from folders.
- `node scripts/make-samples.mjs` writes synthetic sample editions here.

PDFs in this folder are git-ignored: real newspapers are never committed.
