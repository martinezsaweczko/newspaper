/**
 * OpenTelemetry trace export (https://svelte.dev/docs/kit/observability). Started from
 * `src/instrumentation.server.ts` only when traces are configured, so dev and plain installs pay
 * nothing. Metrics are owned by `metrics-setup.ts`, never by this SDK.
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';
import type { IncomingMessage } from 'node:http';
import type { TelemetryConfig, TraceExporterName } from './config.ts';
import { consoleSpanExporter, privateExporter } from './span-privacy.ts';

const createExporter = (name: TraceExporterName) =>
	name === 'console' ? consoleSpanExporter() : new OTLPTraceExporter();

/** The incoming/outgoing HTTP spans. No `headersToSpanAttributes`: no request header is recorded. */
export function httpInstrumentationConfig(
	metricsPort: number | undefined
): HttpInstrumentationConfig {
	return {
		// Prometheus scrapes are not app traffic.
		ignoreIncomingRequestHook: (req: IncomingMessage) =>
			metricsPort !== undefined && req.socket.localPort === metricsPort
	};
}

export function startTracing(config: TelemetryConfig): NodeSDK {
	const metricsPort = config.metrics?.port;
	for (const name of config.unsupportedTraceExporters) {
		console.warn(
			`[telemetry] OTEL_TRACES_EXPORTER=${name} is not supported (otlp, console): ignored`
		);
	}
	const sdk = new NodeSDK({
		serviceName: config.serviceName,
		// OTEL_TRACES_EXPORTER (otlp, console) or else OTLP over http/protobuf to
		// OTEL_EXPORTER_OTLP_ENDPOINT, as in the SvelteKit docs. Always behind privateExporter: no
		// client IP address leaves the process (span-privacy.ts).
		traceExporter: privateExporter(config.traceExporters.map(createExporter)),
		// No metric readers here: the Prometheus endpoint has its own MeterProvider.
		metricReaders: [],
		instrumentations: [
			getNodeAutoInstrumentations({
				'@opentelemetry/instrumentation-fs': { enabled: false },
				'@opentelemetry/instrumentation-dns': { enabled: false },
				'@opentelemetry/instrumentation-net': { enabled: false },
				'@opentelemetry/instrumentation-http': httpInstrumentationConfig(metricsPort)
			})
		]
	});
	sdk.start();
	return sdk;
}
