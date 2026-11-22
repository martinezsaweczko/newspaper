import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Kit's origin check compares schemes and adapter-node assumes https, which would reject
			// every form POST on a plain-http LAN. src/lib/server/auth/origin.ts checks the host instead.
			csrf: { trustedOrigins: ['*'] },
			// OpenTelemetry spans for handle, load, actions and +server handlers. They are no-ops unless
			// src/instrumentation.server.ts registered an exporter (OTEL_EXPORTER_OTLP_ENDPOINT etc.).
			tracing: { server: true }
		})
	],
	test: {
		expect: { requireAssertions: true },
		// `npm run coverage`; CI publishes the line total for the README badge.
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{ts,svelte}'],
			exclude: ['src/**/*.{test,spec}.ts', 'src/**/*.d.ts'],
			reporter: ['text-summary', 'json-summary']
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
