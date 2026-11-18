/**
 * OpenTelemetry trace export (https://svelte.dev/docs/kit/observability). Started from
 * `src/instrumentation.server.ts` only when traces are configured, so dev and plain installs pay
 * nothing. Metrics are owned by `metrics-setup.ts`, never by this SDK.
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { IncomingMessage } from 'node:http';
import type { TelemetryConfig } from './config.ts';

export function startTracing(config: TelemetryConfig): NodeSDK {
	const metricsPort = config.metrics?.port;
	const sdk = new NodeSDK({
		serviceName: config.serviceName,
		// OTEL_TRACES_EXPORTER (console, otlp, zipkin) wins; otherwise OTLP over http/protobuf to
		// OTEL_EXPORTER_OTLP_ENDPOINT, as in the SvelteKit docs.
		traceExporter: config.tracesExporterFromEnv ? undefined : new OTLPTraceExporter(),
		// No metric readers here: the Prometheus endpoint has its own MeterProvider.
		metricReaders: [],
		instrumentations: [
			getNodeAutoInstrumentations({
				'@opentelemetry/instrumentation-fs': { enabled: false },
				'@opentelemetry/instrumentation-dns': { enabled: false },
				'@opentelemetry/instrumentation-net': { enabled: false },
				'@opentelemetry/instrumentation-http': {
					// Prometheus scrapes are not app traffic.
					ignoreIncomingRequestHook: (req: IncomingMessage) =>
						metricsPort !== undefined && req.socket.localPort === metricsPort
				}
			})
		]
	});
	sdk.start();
	return sdk;
}
