# Feature: observability-cicd

## Objective
OpenTelemetry server tracing (per the SvelteKit observability docs), Prometheus metrics reachable
from the LAN only, and a CI/CD pipeline (test on PRs and main, tagged image release to GHCR).

## Decisions (made by the orchestrator)
- Traces: NodeSDK started from `src/instrumentation.server.ts` only when
  `OTEL_EXPORTER_OTLP_ENDPOINT` (or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `OTEL_TRACES_EXPORTER`)
  is set; service name `OTEL_SERVICE_NAME` (default `newspaper`); fs/dns/net instrumentation off;
  `newspaper.user` on `sveltekit.handle.root`; custom spans for thumbnail render and library scan.
- Metrics: own MeterProvider + `PrometheusExporter({ preventServerStart: true })`, served by our
  own `node:http` server on `METRICS_PORT` (9464, `0`/empty disables), `METRICS_HOST` (0.0.0.0),
  `/metrics` only (else 404), socket peer checked against `METRICS_ALLOW` CIDRs (else 403), never
  X-Forwarded-For. Started from `instrumentation.server.ts` (runs before the app under adapter-node,
  never during `vite build`; dev re-imports are guarded on globalThis).
- HTTP duration: our own `http_server_request_duration_seconds` histogram in `handle` labelled by
  route id, method and status. The auto-instrumented HTTP metric was not used: SvelteKit does not
  set `http.route`, and it would require the full NodeSDK even with traces off.
- Container: pruned production `node_modules` in the image (OTel deps are external), `EXPOSE 9464`;
  compose publishes it on `${METRICS_BIND:-127.0.0.1}` only.
- CI/CD: `pipeline.yml` + reusable `ci.yml` (no DB, no Playwright); tag `vX.Y.Z` on main builds,
  smoke-tests (`scripts/smoke-image.sh`), pushes to GHCR and releases.

## Tasks
- [x] T1 Tracing: deps, `tracing.server`, instrumentation, root-span user, custom spans + config tests (route: delegated, writer trigger: 2+ non-trivial files)
- [x] T2 Metrics: CIDR matcher + tests, metrics server + tests, instruments in handle/login/thumb/pdf/library (route: delegated)
- [x] T3 Container/compose/.env.example, smoke script, README Observability, CLAUDE.md note (route: delegated)
- [x] T4 CI/CD workflows + CLAUDE.md CI/CD section (route: delegated)

## Checks
`npm run format`, `npm run lint`, `npm run check`, `npm run test:unit -- --run`, `npm run build`,
runtime smoke with `node build`, dev server start, image build + `scripts/smoke-image.sh`.

## Progress / evidence
- Engram mirror: pending (no Engram tool available to the writer).
- Commits on `feat/observability-cicd`:
  - T1 `06a5c63` feat(observability): OpenTelemetry server tracing
  - T2 `abd1fb5` feat(observability): LAN-only Prometheus metrics endpoint
  - T3 `d3cdaa5` build: ship OpenTelemetry deps in the image and document observability
  - T4 `e4f1752` ci: test pipeline and tagged image release to GHCR; `49e513e` docs: CI/CD notes
- Checks (final tree): format no changes; lint exit 0; check 0 errors / 0 warnings; unit 13 files,
  184 tests passed; build ok.
- Runtime (`node build`, PORT=3125, METRICS_PORT=9465, scratch DATA_DIR): login/thumb/pdf flow ok;
  `/metrics` 200 with 19 `newspaper_*` lines plus `http_server_request_duration_seconds` by route id;
  other path 404; `METRICS_ALLOW=10.9.9.9/32` -> 403 from 127.0.0.1 (X-Forwarded-For ignored);
  SIGTERM exits cleanly; `OTEL_TRACES_EXPORTER=console` printed `sveltekit.handle.root` spans with
  `newspaper.user`, plus `newspaper.thumbnail.render` (cache_hit false/true) and
  `newspaper.library.scan` (12 editions). `vite build` starts no telemetry.
- Dev: `vite dev` on 5199 answered `/login`, metrics on 9466 answered 200; with the port taken it
  logged `metrics endpoint not started ... EADDRINUSE` and kept serving.
- Image: `podman build --format docker` succeeded locally (~323 MB);
  `scripts/smoke-image.sh localhost/newspaper:smoke` passed (login 303 + cookie, thumb image/jpeg,
  healthcheck, metrics 200 through the podman port mapping).
- Found and fixed: import-in-the-middle wrapping the app's own bundle made every request a 500
  (`hooks.reroute is not a function`); the bundle directory is now excluded from the hooks.
- Workflows validated as YAML (python yaml) and prettier only; actionlint not available; they
  cannot run locally.
- Test-first note: specs were written with each module and run before wiring; no separate RED run
  was recorded.

## Next step
User review; native review of the work-unit commits if available; push/PR is a human decision.
