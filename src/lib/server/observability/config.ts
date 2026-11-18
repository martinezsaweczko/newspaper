/**
 * Telemetry configuration from the process environment. Pure, so it is unit-testable; read by
 * `src/instrumentation.server.ts` straight from `process.env` (it runs before `src/env.ts` is used).
 */
import { DEFAULT_METRICS_ALLOW, parseAllowList, type Cidr } from './cidr.ts';

export interface TelemetryConfig {
	/** Export traces: only when an OTLP endpoint or an explicit trace exporter is configured. */
	traces: boolean;
	/** `OTEL_TRACES_EXPORTER` was given, so the SDK picks the exporter itself (otlp, console...). */
	tracesExporterFromEnv: boolean;
	serviceName: string;
	/** The LAN-only Prometheus endpoint, or null when disabled (`METRICS_PORT=0` or empty). */
	metrics: { port: number; host: string; allow: Cidr[] } | null;
}

export const DEFAULT_METRICS_PORT = 9464;

type Env = Record<string, string | undefined>;

const set = (value: string | undefined) => value !== undefined && value.trim() !== '';

export function telemetryConfig(env: Env): TelemetryConfig {
	const exporter = env.OTEL_TRACES_EXPORTER?.trim().toLowerCase();
	const tracesExporterFromEnv = set(exporter) && exporter !== 'none';
	const traces =
		exporter !== 'none' &&
		(tracesExporterFromEnv ||
			set(env.OTEL_EXPORTER_OTLP_ENDPOINT) ||
			set(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT));

	const rawPort = env.METRICS_PORT;
	let metrics: TelemetryConfig['metrics'] = null;
	if (rawPort === undefined || rawPort.trim() !== '') {
		const port = rawPort === undefined ? DEFAULT_METRICS_PORT : Number(rawPort.trim());
		if (!Number.isInteger(port) || port < 0 || port > 65535) {
			throw new Error(`METRICS_PORT must be a port number (0 disables it), got "${rawPort}"`);
		}
		if (port !== 0) {
			metrics = {
				port,
				host: set(env.METRICS_HOST) ? env.METRICS_HOST!.trim() : '0.0.0.0',
				allow: parseAllowList(set(env.METRICS_ALLOW) ? env.METRICS_ALLOW! : DEFAULT_METRICS_ALLOW)
			};
		}
	}

	return {
		traces,
		tracesExporterFromEnv,
		serviceName: set(env.OTEL_SERVICE_NAME) ? env.OTEL_SERVICE_NAME!.trim() : 'newspaper',
		metrics
	};
}
