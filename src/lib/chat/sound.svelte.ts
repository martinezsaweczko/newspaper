/**
 * The new-message sound: a water drop synthesised with the Web Audio API (no audio file). Browsers
 * only let a page make sound after the person interacted with it, so the audio context is created
 * on the first click or key press. With several tabs open, only one plays each message. Muting is a
 * per-browser preference (localStorage).
 */

const PREF = 'np:chat-sound';

function readPref(): boolean {
	try {
		return localStorage.getItem(PREF) !== 'off';
	} catch {
		return true;
	}
}

class SoundState {
	/** Play the drop for new messages? On by default. */
	enabled = $state(typeof window === 'undefined' ? true : readPref());
}

export const sound = new SoundState();

let context: AudioContext | null = null;

/** Create (or wake) the audio context; call from a user gesture. */
function unlock() {
	try {
		context ??= new AudioContext();
		if (context.state === 'suspended') void context.resume();
	} catch {
		// no Web Audio: stay silent
	}
}

let listening = false;
/** Arm the first-gesture unlock (idempotent). */
export function armSound(): void {
	if (listening || typeof window === 'undefined') return;
	listening = true;
	const once = () => {
		unlock();
		window.removeEventListener('pointerdown', once);
		window.removeEventListener('keydown', once);
	};
	window.addEventListener('pointerdown', once);
	window.addEventListener('keydown', once);
}

/**
 * One drop: a sine that glides quickly upwards (the "plip" of water) with a fast attack and a short
 * decay, then a quieter, higher echo.
 */
function drop(ctx: AudioContext, at: number, from: number, to: number, peak: number) {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(from, at);
	osc.frequency.exponentialRampToValueAtTime(to, at + 0.06);
	gain.gain.setValueAtTime(0.0001, at);
	gain.gain.exponentialRampToValueAtTime(peak, at + 0.006);
	gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
	osc.connect(gain).connect(ctx.destination);
	osc.start(at);
	osc.stop(at + 0.25);
}

function playNow() {
	if (!context || context.state !== 'running') return;
	const t = context.currentTime + 0.01;
	drop(context, t, 380, 1150, 0.28);
	drop(context, t + 0.11, 700, 1700, 0.07);
}

/**
 * Play the drop for message `id`, once across this browser's tabs: the visible tab plays it; when
 * none is visible, the first tab to claim the id does.
 */
export function playDrop(id: number): void {
	if (!sound.enabled) return;
	const visible = document.visibilityState === 'visible';
	const delay = visible ? 0 : 150; // let a visible tab claim it first
	setTimeout(() => {
		try {
			const key = `np:chat-drop:${id}`;
			if (localStorage.getItem(key)) return;
			localStorage.setItem(key, '1');
			setTimeout(() => localStorage.removeItem(key), 60_000);
		} catch {
			// no storage: every tab plays, which is still fine
		}
		playNow();
	}, delay);
}

/** Turn the sound on or off (remembered in this browser); turning it on plays a sample. */
export function setSound(on: boolean): void {
	sound.enabled = on;
	try {
		localStorage.setItem(PREF, on ? 'on' : 'off');
	} catch {
		// not remembered, still applies to this page
	}
	if (on) {
		unlock();
		playNow();
	}
}
