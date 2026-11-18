/**
 * Loaded by SvelteKit before any application code (https://svelte.dev/docs/kit/observability).
 * Reads plain `process.env` on purpose: `src/env.ts` must not be imported here.
 */
import { register } from 'import-in-the-middle/register-hooks.mjs';
import { startTelemetry } from '#lib/server/observability/setup.ts';

// ESM hooks so auto-instrumentation can patch packages imported after this point (Node 24.11.1+).
// The app's own bundle (this directory) is excluded: wrapping its chunks broke a circular import
// in the bundled SvelteKit runtime (`hooks.reroute is not a function`, every request a 500), and
// nothing in it is auto-instrumented anyway.
const ownBundle = new URL('.', import.meta.url).href;
register({ exclude: [new RegExp(`^${ownBundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)] });
startTelemetry(process.env);
