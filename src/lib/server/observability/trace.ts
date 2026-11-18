/** Custom spans for app code. Without a registered tracer provider these are cheap no-ops. */
import { SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api';

export const tracer = () => trace.getTracer('newspaper');

/** Run `fn` inside an active span; errors are recorded on the span and rethrown. */
export function withSpan<T>(name: string, attributes: Attributes, fn: (span: Span) => T): T {
	return tracer().startActiveSpan(name, { attributes }, (span) => {
		const fail = (err: unknown) => {
			span.recordException(err as Error);
			span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
			span.end();
			throw err;
		};
		try {
			const result = fn(span);
			if (result instanceof Promise) {
				return result.then((value) => {
					span.end();
					return value;
				}, fail) as T;
			}
			span.end();
			return result;
		} catch (err) {
			return fail(err);
		}
	});
}
