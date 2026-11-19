/**
 * Client addresses never leave the process in a trace. The HTTP auto-instrumentation records the
 * peer of every incoming request (`client.address`, `network.peer.address`, `net.peer.ip`, and
 * `http.client_ip` from X-Forwarded-For), which the privacy policy does not cover.
 *
 * The scrub happens in an exporter decorator (tracing.ts wraps every exporter in it), the last
 * step before anything is printed or sent, so it covers every span from every instrumentation,
 * whatever semconv version it follows, with no attribute list per instrumentation to maintain.
 * A span processor would do the same, but NodeSDK only accepts processors instead of its own
 * BatchSpanProcessor, which would mean importing `@opentelemetry/sdk-trace` at runtime; it is not
 * a direct dependency, so adapter-node would bundle a second copy of it.
 */
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';
import { inspect } from 'node:util';

type ExportResult = Parameters<Parameters<SpanExporter['export']>[1]>[0];

/** Peer attributes, old and stable semantic conventions. */
const CLIENT_ADDRESS_KEYS = new Set([
	'client.address',
	'client.port',
	'network.peer.address',
	'network.peer.port',
	'net.peer.ip',
	'net.peer.port',
	'net.sock.peer.addr',
	'net.sock.peer.port',
	'net.sock.peer.name',
	'http.client_ip'
]);

/** Captured request headers (`headersToSpanAttributes`) could carry X-Forwarded-For & co. */
const REQUEST_HEADER_PREFIX = 'http.request.header.';

export function isClientAddressKey(key: string): boolean {
	return CLIENT_ADDRESS_KEYS.has(key) || key.startsWith(REQUEST_HEADER_PREFIX);
}

/** Removes the client address attributes in place (the span has ended; only exporters read it). */
export function scrubSpan(span: ReadableSpan): ReadableSpan {
	const attributes = span.attributes as Record<string, unknown>;
	for (const key of Object.keys(attributes)) {
		if (isClientAddressKey(key)) delete attributes[key];
	}
	return span;
}

const SUCCESS: ExportResult = { code: 0 }; // ExportResultCode.SUCCESS
const FAILED: ExportResult = { code: 1 }; // ExportResultCode.FAILED

/** Scrubs every batch, then hands it to each target exporter. */
export function privateExporter(targets: SpanExporter[]): SpanExporter {
	return {
		export(spans, done) {
			for (const span of spans) scrubSpan(span);
			if (targets.length === 0) return done(SUCCESS);
			let left = targets.length;
			let result = SUCCESS;
			for (const target of targets) {
				target.export(spans, (r) => {
					if (r.code !== 0) result = r.error ? { code: 1, error: r.error } : FAILED;
					if (--left === 0) done(result);
				});
			}
		},
		async shutdown() {
			await Promise.all(targets.map((t) => t.shutdown()));
		},
		async forceFlush() {
			await Promise.all(targets.map((t) => t.forceFlush?.()));
		}
	};
}

/**
 * `OTEL_TRACES_EXPORTER=console`: prints each span like the SDK's ConsoleSpanExporter, for
 * looking at traces without a collector.
 */
export function consoleSpanExporter(): SpanExporter {
	return {
		export(spans, done) {
			for (const span of spans) {
				const ctx = span.spanContext();
				console.log(
					inspect(
						{
							resource: { attributes: span.resource.attributes },
							instrumentationScope: span.instrumentationScope,
							traceId: ctx.traceId,
							parentSpanId: span.parentSpanContext?.spanId,
							name: span.name,
							id: ctx.spanId,
							kind: span.kind,
							timestamp: span.startTime[0] * 1e6 + Math.round(span.startTime[1] / 1e3),
							duration: span.duration[0] * 1e6 + Math.round(span.duration[1] / 1e3),
							attributes: span.attributes,
							status: span.status,
							events: span.events
						},
						{ depth: 3, breakLength: 100 }
					)
				);
			}
			done(SUCCESS);
		},
		async shutdown() {}
	};
}
