/**
 * Starts telemetry once per process (the dev server re-imports the instrumentation file, so the
 * state lives on globalThis). Called from `src/instrumentation.server.ts`.
 */
import { telemetryConfig, type TelemetryConfig } from './config.ts';
import { startTracing } from './tracing.ts';

interface TelemetryState {
	config: TelemetryConfig;
	shutdown: () => Promise<void>;
}

const KEY = Symbol.for('newspaper.telemetry');
type Global = typeof globalThis & { [KEY]?: TelemetryState };

export function startTelemetry(env: Record<string, string | undefined>): TelemetryState {
	const g = globalThis as Global;
	const existing = g[KEY];
	if (existing) return existing;

	const config = telemetryConfig(env);
	const stops: (() => Promise<void>)[] = [];

	if (config.traces) {
		const sdk = startTracing(config);
		stops.push(() => sdk.shutdown());
		console.log(`[telemetry] tracing on (service ${config.serviceName})`);
	}

	const state: TelemetryState = {
		config,
		shutdown: async () => {
			await Promise.allSettled(stops.map((stop) => stop()));
		}
	};
	g[KEY] = state;
	// adapter-node emits this after closing the HTTP server: flush pending spans.
	process.once('sveltekit:shutdown' as 'beforeExit', () => void state.shutdown());
	return state;
}
