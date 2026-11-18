import { describe, expect, it } from 'vitest';
import { telemetryConfig } from './config.ts';

describe('telemetryConfig', () => {
	it('defaults: no traces, metrics on 0.0.0.0:9464 with the LAN allowlist', () => {
		const config = telemetryConfig({});
		expect(config.traces).toBe(false);
		expect(config.serviceName).toBe('newspaper');
		expect(config.metrics).toMatchObject({ port: 9464, host: '0.0.0.0' });
		expect(config.metrics?.allow).toHaveLength(7);
	});

	it.each([
		[{ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://jaeger:4318' }, true, false],
		[{ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://jaeger:4318/v1/traces' }, true, false],
		[{ OTEL_TRACES_EXPORTER: 'console' }, true, true],
		[{ OTEL_TRACES_EXPORTER: 'none', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://x:4318' }, false, false],
		[{ OTEL_EXPORTER_OTLP_ENDPOINT: '  ' }, false, false]
	])('traces for %j -> %s', (env, traces, fromEnv) => {
		const config = telemetryConfig(env);
		expect(config.traces).toBe(traces);
		expect(config.tracesExporterFromEnv).toBe(fromEnv);
	});

	it('takes the service name from OTEL_SERVICE_NAME', () => {
		expect(telemetryConfig({ OTEL_SERVICE_NAME: 'kiosk' }).serviceName).toBe('kiosk');
	});

	it.each(['0', ''])('METRICS_PORT=%j disables metrics', (port) => {
		expect(telemetryConfig({ METRICS_PORT: port }).metrics).toBeNull();
	});

	it('honours METRICS_PORT, METRICS_HOST and METRICS_ALLOW', () => {
		const config = telemetryConfig({
			METRICS_PORT: '9500',
			METRICS_HOST: '192.168.1.10',
			METRICS_ALLOW: '192.168.1.0/24'
		});
		expect(config.metrics).toMatchObject({ port: 9500, host: '192.168.1.10' });
		expect(config.metrics?.allow).toHaveLength(1);
	});

	it.each(['abc', '70000', '-1', '1.5'])('rejects METRICS_PORT=%j', (port) => {
		expect(() => telemetryConfig({ METRICS_PORT: port })).toThrow(/METRICS_PORT/);
	});

	it('rejects an invalid allowlist instead of opening access', () => {
		expect(() => telemetryConfig({ METRICS_ALLOW: '10.0.0.0/8,everyone' })).toThrow(/everyone/);
	});
});
