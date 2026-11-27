import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPresence, type PresenceView } from './presence.ts';

const reader = { key: '7', admin: false };
const other = { key: '8', admin: false };
const admin = { key: 'local:root', admin: true };

function inbox() {
	const views: PresenceView[] = [];
	return { views, send: (v: PresenceView) => views.push(v), last: () => views.at(-1) };
}

describe('createPresence', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('tells readers only whether an admin is online, and admins who is online', () => {
		const hub = createPresence();
		const r = inbox();
		hub.connect(reader, r.send);
		expect(r.views).toEqual([{ admins: false }]);

		const a = inbox();
		hub.connect(admin, a.send);
		expect(a.last()).toEqual({ admins: true, online: ['7', 'local:root'] });
		expect(r.last()).toEqual({ admins: true });
		expect(r.views).toHaveLength(2);
	});

	it('sends a view only when it changed', () => {
		const hub = createPresence();
		const r = inbox();
		hub.connect(reader, r.send);
		hub.connect(other, () => {}); // a reader's view does not change when another reader comes
		expect(r.views).toEqual([{ admins: false }]);
	});

	it('keeps a person online during the grace period, and across a reload', () => {
		const hub = createPresence({ graceMs: 30_000 });
		const a = inbox();
		hub.connect(admin, a.send);
		const leave = hub.connect(reader, () => {});
		expect(hub.online()).toEqual(['7', 'local:root']);

		const before = a.views.length;
		leave();
		vi.advanceTimersByTime(29_000);
		expect(hub.online()).toContain('7');
		hub.connect(reader, () => {}); // the reload's new connection
		vi.advanceTimersByTime(60_000);
		expect(hub.online()).toContain('7');
		expect(a.views).toHaveLength(before); // the admin never saw the reader leave
	});

	it('goes offline after the grace period once the last tab closes', () => {
		const hub = createPresence({ graceMs: 30_000 });
		const r = inbox();
		hub.connect(reader, r.send);
		const tab1 = hub.connect(admin, () => {});
		const tab2 = hub.connect(admin, () => {});
		tab1();
		vi.advanceTimersByTime(60_000);
		expect(r.last()).toEqual({ admins: true });
		tab2();
		tab2(); // twice is harmless
		vi.advanceTimersByTime(30_000);
		expect(hub.online()).toEqual(['7']);
		expect(r.last()).toEqual({ admins: false });
	});

	it('updates the view when a reconnect comes back with another role', () => {
		const hub = createPresence();
		const r = inbox();
		hub.connect(other, r.send);
		const leave = hub.connect(reader, () => {});
		leave();
		hub.connect({ ...reader, admin: true }, () => {}); // promoted, within the grace period
		expect(r.last()).toEqual({ admins: true });
	});

	it('counts connections and people by role', () => {
		const hub = createPresence();
		hub.connect(reader, () => {});
		hub.connect(reader, () => {});
		hub.connect(admin, () => {});
		expect(hub.counts()).toEqual({ connections: 3, online: { user: 1, admin: 1 } });
	});

	it('survives a send on a closed stream and closes every stream on shutdown', () => {
		const hub = createPresence();
		const close = vi.fn();
		hub.connect(
			reader,
			() => {
				throw new Error('closed');
			},
			close
		);
		expect(() => hub.connect(admin, () => {}, close)).not.toThrow();
		hub.closeAll();
		expect(close).toHaveBeenCalledTimes(2);
	});
});
