import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) =>
	value === undefined || value === '' ? undefined : value;

export const variables = defineEnvVars({
	NEWSPAPER_DIR: {
		description: 'The shared flat folder of newspaper PDFs (read-only). Default ./newspapers',
		schema: (value) => optional(value) ?? './newspapers'
	},
	DATA_DIR: {
		description:
			'Writable app data: users.json, regions.json, ignore.json, thumbs/. Default ./data',
		schema: (value) => optional(value) ?? './data'
	},
	SESSION_SECRET: {
		description: 'HMAC key for session cookies. Required in production (32+ characters).',
		schema: (value) => optional(value)
	},
	COOKIE_SECURE: {
		description: 'Set to "true" behind https so the session cookie is Secure. Default false.',
		schema: (value) => /^(1|true|yes|on)$/i.test(value ?? '')
	},
	AUTH_DISABLED: {
		description:
			'Testing only: "true" skips the login under `npm run dev`. Ignored by production builds.',
		schema: (value) => /^(1|true|yes|on)$/i.test(value ?? '')
	}
});
