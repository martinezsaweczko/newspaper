# Shared folder (development)

This is the development stand-in for the shared newspaper folder (`NEWSPAPER_DIR`, default
`./newspapers`). Drop PDFs here, at the top level or in subfolders (up to 4 levels deep, e.g.
`nacional/`, `internacional/`, `magazine/`); the app only reads them. Hidden files and folders
(`.name`) are skipped and symlinked folders are not followed.

- File names give the masthead and the date: `la-voz-de-galicia-2026-11-17.pdf`,
  `El_Correo_20261117.pdf`, `diario de sevilla 17-11-2026.pdf`. Without a date the file's
  modification date is used. The folder never changes the masthead.
- The region comes from `DATA_DIR/regions.json`, never from folders: subfolders are storage only.
- The same masthead and date in two subfolders is one edition (the larger file wins).
- `node scripts/make-samples.mjs` writes synthetic sample editions here.

PDFs in this folder are git-ignored: real newspapers are never committed.
