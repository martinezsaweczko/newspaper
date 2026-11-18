import { describe, expect, it } from 'vitest';
import { DEFAULT_METRICS_ALLOW, isAllowed, parseAllowList, parseCidr } from './cidr.ts';

describe('parseCidr', () => {
	it.each([
		['10.0.0.0/8', { family: 4, prefix: 8 }],
		['192.168.1.7', { family: 4, prefix: 32 }],
		['::1/128', { family: 6, prefix: 128 }],
		['fc00::/7', { family: 6, prefix: 7 }],
		['0.0.0.0/0', { family: 4, prefix: 0 }]
	])('parses %s', (text, expected) => {
		expect(parseCidr(text)).toMatchObject(expected);
	});

	it.each([
		'',
		'10.0.0.0/33',
		'::/129',
		'10.0.0/8',
		'10.0.0.0/8/1',
		'10.0.0.0/-1',
		'10.0.0.0/x',
		'example.com/24',
		'300.1.1.1/8'
	])('rejects %j', (text) => {
		expect(parseCidr(text)).toBeNull();
	});

	it('masks the host bits of the network', () => {
		expect(parseCidr('192.168.1.77/24')).toEqual(parseCidr('192.168.1.0/24'));
	});
});

describe('parseAllowList', () => {
	it('parses the default list', () => {
		expect(parseAllowList(DEFAULT_METRICS_ALLOW)).toHaveLength(7);
	});

	it('ignores blanks and throws on an invalid entry', () => {
		expect(parseAllowList(' 10.0.0.0/8 , ,::1 ')).toHaveLength(2);
		expect(() => parseAllowList('10.0.0.0/8,nope')).toThrow(/nope/);
	});
});

describe('isAllowed', () => {
	const lan = parseAllowList(DEFAULT_METRICS_ALLOW);

	it.each([
		['127.0.0.1', true],
		['10.20.30.40', true],
		['172.16.0.1', true],
		['172.31.255.255', true],
		['172.32.0.1', false],
		['172.15.255.255', false],
		['192.168.1.20', true],
		['192.169.0.1', false],
		['8.8.8.8', false],
		['::1', true],
		['::2', false],
		['fd12:3456::1', true],
		['fc00::1', true],
		['fe80::1%eth0', true],
		['fe80::abcd', true],
		['fec0::1', false],
		['2001:db8::1', false],
		// IPv4-mapped IPv6, as reported by a dual-stack socket
		['::ffff:192.168.1.5', true],
		['::ffff:127.0.0.1', true],
		['::ffff:8.8.8.8', false],
		['::ffff:c0a8:0105', true],
		['[::1]', true],
		['', false],
		['not-an-ip', false]
	])('%s -> %s', (address, expected) => {
		expect(isAllowed(address, lan)).toBe(expected);
	});

	it('rejects undefined and an empty allowlist', () => {
		expect(isAllowed(undefined, lan)).toBe(false);
		expect(isAllowed('127.0.0.1', [])).toBe(false);
	});

	it('matches a single host exactly', () => {
		const one = parseAllowList('10.9.9.9/32');
		expect(isAllowed('10.9.9.9', one)).toBe(true);
		expect(isAllowed('::ffff:10.9.9.9', one)).toBe(true);
		expect(isAllowed('10.9.9.8', one)).toBe(false);
		expect(isAllowed('127.0.0.1', one)).toBe(false);
	});

	it('0.0.0.0/0 matches every IPv4 address but no IPv6 one', () => {
		const any4 = parseAllowList('0.0.0.0/0');
		expect(isAllowed('203.0.113.9', any4)).toBe(true);
		expect(isAllowed('2001:db8::1', any4)).toBe(false);
	});
});
