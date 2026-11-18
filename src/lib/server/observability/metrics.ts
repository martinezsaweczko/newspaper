/**
 * App metrics through the OpenTelemetry API. Instruments are created on first use, after
 * `src/instrumentation.server.ts` registered the Prometheus MeterProvider; without one they are
 * no-ops (tests, METRICS_PORT=0). Labels stay low-cardinality: never usernames, ids or filenames.
 */
import { metrics, ValueType } from '@opentelemetry/api';

export type ThumbResult = 'hit' | 'miss' | 'error';
export type LoginResult = 'success' | 'failure' | 'throttled';

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

let editionCount: number | undefined;

function create() {
	const meter = metrics.getMeter('newspaper');
	meter
		.createObservableGauge('newspaper_editions', {
			description: 'Editions found by the last scan of the shared folder',
			valueType: ValueType.INT
		})
		.addCallback((result) => {
			if (editionCount !== undefined) result.observe(editionCount);
		});
	return {
		http: meter.createHistogram('http_server_request_duration_seconds', {
			description: 'Duration of HTTP requests handled by SvelteKit, by route id',
			unit: 's',
			advice: {
				explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
			}
		}),
		thumbRenders: meter.createCounter('newspaper_thumbnail_renders', {
			description: 'Front-page requests by result (hit = disk cache, miss = rendered now)',
			valueType: ValueType.INT
		}),
		thumbDuration: meter.createHistogram('newspaper_thumbnail_render_duration_seconds', {
			description: 'Time to serve a front page, including a pdftoppm render on a miss',
			unit: 's',
			advice: { explicitBucketBoundaries: [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30] }
		}),
		logins: meter.createCounter('newspaper_logins', {
			description: 'Login attempts by result',
			valueType: ValueType.INT
		}),
		pdfBytes: meter.createCounter('newspaper_pdf_bytes_sent', {
			description: 'PDF bytes streamed to clients',
			unit: 'By',
			valueType: ValueType.INT
		})
	};
}

let instruments: ReturnType<typeof create> | undefined;
const get = () => (instruments ??= create());

/** Create the instruments now so the series exist before the first request. */
export function initMetrics(): void {
	get();
}

export function recordHttpRequest(
	route: string | null,
	method: string,
	status: number,
	seconds: number
): void {
	get().http.record(seconds, {
		'http.route': route ?? 'unmatched',
		'http.request.method': METHODS.has(method) ? method : '_OTHER',
		'http.response.status_code': status
	});
}

export function recordThumbnail(result: ThumbResult, seconds: number): void {
	get().thumbRenders.add(1, { result });
	get().thumbDuration.record(seconds, { result });
}

export function recordLogin(result: LoginResult): void {
	get().logins.add(1, { result });
}

export function addPdfBytes(bytes: number): void {
	if (bytes > 0) get().pdfBytes.add(bytes);
}

export function setEditionCount(count: number): void {
	editionCount = count;
	get();
}
