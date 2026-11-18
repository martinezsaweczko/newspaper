/**
 * The Prometheus side of telemetry: a MeterProvider whose only reader is a PrometheusExporter
 * that never starts its own server; our LAN-only server (metrics-server.ts) serves its output.
 */
import { metrics } from '@opentelemetry/api';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { AggregationType, MeterProvider } from '@opentelemetry/sdk-metrics';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { TelemetryConfig } from './config.ts';
import { createMetricsServer, listenMetrics } from './metrics-server.ts';

export function startMetrics(
	config: TelemetryConfig & { metrics: NonNullable<TelemetryConfig['metrics']> }
): () => Promise<void> {
	const { port, host, allow } = config.metrics;
	const exporter = new PrometheusExporter({ preventServerStart: true });
	const provider = new MeterProvider({
		resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: config.serviceName }),
		readers: [exporter],
		// Only our own meter: instrumentation libraries (when tracing is on) would otherwise add
		// unlabelled duplicates of http_server_request_duration_seconds.
		views: [
			{
				meterName: '@opentelemetry/instrumentation-http',
				aggregation: { type: AggregationType.DROP }
			}
		]
	});
	metrics.setGlobalMeterProvider(provider);

	const server = createMetricsServer(
		(req, res) => exporter.getMetricsRequestHandler(req, res),
		allow
	);
	void listenMetrics(server, port, host).then((ok) => {
		if (ok) console.log(`[telemetry] metrics on http://${host}:${port}/metrics (LAN only)`);
	});

	return async () => {
		server.close();
		await provider.shutdown();
	};
}
