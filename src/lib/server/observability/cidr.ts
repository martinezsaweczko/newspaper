/**
 * Pure CIDR allowlist matching for the metrics endpoint (IPv4 and IPv6, no dependencies).
 * IPv4-mapped IPv6 addresses (`::ffff:192.168.1.5`) are matched as their IPv4 address.
 */
import { isIP } from 'node:net';

export interface Cidr {
	family: 4 | 6;
	/** The network address as a big integer (32 or 128 bits). */
	network: bigint;
	prefix: number;
}

/** The private, loopback and link-local ranges: reachable from the LAN, never from the internet. */
export const DEFAULT_METRICS_ALLOW =
	'127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128,fc00::/7,fe80::/10';

function ipv4ToBigInt(address: string): bigint {
	return address
		.split('.')
		.reduce((acc, part) => (acc << 8n) | BigInt(Number.parseInt(part, 10)), 0n);
}

function ipv6ToBigInt(address: string): bigint {
	let text = address.split('%')[0]; // drop a zone id (fe80::1%eth0)
	// a trailing embedded IPv4 (::ffff:1.2.3.4) becomes two hex groups
	const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
	if (v4) {
		const n = ipv4ToBigInt(v4[1]);
		text = `${text.slice(0, -v4[1].length)}${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`;
	}
	const [head, tail] = text.split('::');
	const headGroups = head ? head.split(':') : [];
	const tailGroups = tail === undefined ? [] : tail ? tail.split(':') : [];
	const missing = 8 - headGroups.length - tailGroups.length;
	const groups =
		tail === undefined ? headGroups : [...headGroups, ...Array(missing).fill('0'), ...tailGroups];
	return groups.reduce((acc, g) => (acc << 16n) | BigInt(Number.parseInt(g, 16)), 0n);
}

/** Normalise an address: strip brackets and zone ids, and unwrap IPv4-mapped IPv6. */
export function normaliseAddress(address: string): { family: 4 | 6; value: bigint } | null {
	let text = address.trim();
	if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
	const plain = text.split('%')[0];
	const family = isIP(plain);
	if (family === 4) return { family: 4, value: ipv4ToBigInt(plain) };
	if (family !== 6) return null;
	const value = ipv6ToBigInt(plain);
	if (value >> 32n === 0xffffn) return { family: 4, value: value & 0xffffffffn };
	return { family: 6, value };
}

/** Parse `a.b.c.d/n` or `x::y/n` (a bare address means a single host). Null when invalid. */
export function parseCidr(text: string): Cidr | null {
	const [addr, bits, extra] = text.trim().split('/');
	if (extra !== undefined || !addr) return null;
	const plain = addr.split('%')[0];
	const family = isIP(plain);
	if (family !== 4 && family !== 6) return null;
	const width = family === 4 ? 32 : 128;
	const prefix = bits === undefined ? width : Number(bits);
	if (!/^\d+$/.test(bits ?? String(width)) || prefix < 0 || prefix > width) return null;
	const value = family === 4 ? ipv4ToBigInt(plain) : ipv6ToBigInt(plain);
	return { family, network: value & mask(width, prefix), prefix };
}

function mask(width: number, prefix: number): bigint {
	if (prefix === 0) return 0n;
	return ((1n << BigInt(prefix)) - 1n) << BigInt(width - prefix);
}

/** Parse a comma-separated allowlist. Throws on an invalid entry so a typo never opens access. */
export function parseAllowList(text: string): Cidr[] {
	return text
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const cidr = parseCidr(entry);
			if (!cidr) throw new Error(`Invalid CIDR in METRICS_ALLOW: "${entry}"`);
			return cidr;
		});
}

/** Whether `address` (as reported by `socket.remoteAddress`) falls in any of the ranges. */
export function isAllowed(address: string | undefined, allow: readonly Cidr[]): boolean {
	if (!address) return false;
	const parsed = normaliseAddress(address);
	if (!parsed) return false;
	const width = parsed.family === 4 ? 32 : 128;
	return allow.some(
		(cidr) =>
			cidr.family === parsed.family && (parsed.value & mask(width, cidr.prefix)) === cidr.network
	);
}
