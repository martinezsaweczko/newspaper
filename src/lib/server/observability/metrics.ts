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

/** Values of the DB-backed gauges (users by status, active readers by window). */
export interface DbGaugeValues {
	users: Record<'pending' | 'approved' | 'blocked', number>;
	readers: Record<'1d' | '7d' | '30d', number>;
}
let dbGauges: (() => Promise<DbGaugeValues | null>) | undefined;

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
	const users = meter.createObservableGauge('newspaper_users', {
		description: 'Google accounts by status (pending, approved, blocked)',
		valueType: ValueType.INT
	});
	const readers = meter.createObservableGauge('newspaper_readers_active', {
		description: 'Distinct readers with at least one opening in the window (1d, 7d, 30d)',
		valueType: ValueType.INT
	});
	meter.addBatchObservableCallback(
		async (result) => {
			const values = dbGauges ? await dbGauges() : null;
			if (!values) return;
			for (const [status, n] of Object.entries(values.users)) result.observe(users, n, { status });
			for (const [window, n] of Object.entries(values.readers)) {
				result.observe(readers, n, { window });
			}
		},
		[users, readers]
	);
	return {
		pageViews: meter.createCounter('newspaper_page_views', {
			description: 'HTML page views by route id (documents and client-side navigations, 2xx GET)',
			valueType: ValueType.INT
		}),
		editionsOpened: meter.createCounter('newspaper_editions_opened', {
			description:
				'Editions opened or downloaded by newspaper slug and region, as recorded in the reading log (deduped)',
			valueType: ValueType.INT
		}),
		frontPagesViewed: meter.createCounter('newspaper_front_pages_viewed', {
			description: 'Front pages served to browsers (200), by newspaper slug and region',
			valueType: ValueType.INT
		}),
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

/** Route ids that are not pages: never page views even if they answered HTML. */
const NOT_PAGES = new Set(['/thumb/[id]', '/pdf/[id]', '/admin/lecturas.csv']);

export interface PageViewInput {
	route: string | null;
	method: string;
	status: number;
	/** The response's content type. */
	contentType: string | null;
	/** A SvelteKit `__data.json` request (a client-side navigation). */
	isDataRequest: boolean;
}

/** Is this response a page someone looked at? A 2xx GET of an HTML page or its navigation data. */
export function isPageView(input: PageViewInput): boolean {
	if (input.method !== 'GET' || input.status < 200 || input.status > 299) return false;
	if (!input.route || NOT_PAGES.has(input.route)) return false;
	return input.isDataRequest || (input.contentType ?? '').startsWith('text/html');
}

export function recordPageView(input: PageViewInput): void {
	if (isPageView(input)) get().pageViews.add(1, { route: input.route! });
}

/** newspaper = masthead slug (bounded by the folder's mastheads), never the file or the reader. */
export function recordEditionOpened(newspaper: string, region: string, kind: string): void {
	get().editionsOpened.add(1, { newspaper, region, kind });
}

export function recordFrontPageViewed(newspaper: string, region: string): void {
	get().frontPagesViewed.add(1, { newspaper, region });
}

/** The source of newspaper_users and newspaper_readers_active (a cached DB query). */
export function setDbGauges(source: () => Promise<DbGaugeValues | null>): void {
	dbGauges = source;
	get();
}

/**
 * Cache an async loader for scrapes: at most one load per `ttlMs` (failures included, so a down
 * database is not hit on every scrape), and a scrape waits at most `timeoutMs` for it before
 * answering with the last values.
 */
export function cachedLoader<T>(
	load: () => Promise<T>,
	{
		ttlMs = 60_000,
		timeoutMs = 2000,
		now = Date.now,
		onError = (err: unknown) =>
			console.warn(`[metrics] gauge query failed: ${(err as Error)?.message ?? err}`)
	}: {
		ttlMs?: number;
		timeoutMs?: number;
		now?: () => number;
		onError?: (err: unknown) => void;
	} = {}
): () => Promise<T | null> {
	let value: T | null = null;
	let attemptedAt = -Infinity;
	let inFlight: Promise<void> | null = null;
	return async () => {
		if (!inFlight && now() - attemptedAt >= ttlMs) {
			attemptedAt = now();
			inFlight = load().then(
				(v) => {
					value = v;
				},
				(err) => onError(err)
			);
			void inFlight.finally(() => {
				inFlight = null;
			});
		}
		if (inFlight) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			await Promise.race([
				inFlight,
				new Promise((resolve) => (timer = setTimeout(resolve, timeoutMs)))
			]);
			clearTimeout(timer);
		}
		return value;
	};
}
