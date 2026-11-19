import { describe, expect, it } from 'vitest';
import { legalContact } from './legal.ts';

describe('legalContact', () => {
	it('uses the configured operator and contact address', () => {
		expect(legalContact(' Ana Pérez ', 'privacidad@example.com', 'root@example.com')).toEqual({
			operator: 'Ana Pérez',
			email: 'privacidad@example.com'
		});
	});

	it('falls back to the first admin email, then to nothing', () => {
		expect(legalContact(undefined, undefined, 'Root@Example.com, otra@example.com')).toEqual({
			operator: null,
			email: 'root@example.com'
		});
		expect(legalContact('', '', '')).toEqual({ operator: null, email: null });
		expect(legalContact(undefined, 'no-es-un-correo', undefined)).toEqual({
			operator: null,
			email: null
		});
	});
});
