/** Text helpers shared by filename parsing and region matching. Pure. */

/** Lowercase, accents stripped, every non-alphanumeric run collapsed to one space. */
export function normalise(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/** Accent-stripped kebab case: `La Voz de Galicia` -> `la-voz-de-galicia`. */
export function slugify(text: string): string {
	return normalise(text).replace(/ /g, '-');
}

/** Words kept lowercase in a masthead unless they open it. */
const SMALL_WORDS = new Set([
	'a',
	'al',
	'de',
	'del',
	'el',
	'en',
	'i',
	'la',
	'las',
	'les',
	'lo',
	'los',
	'y',
	'e',
	'of',
	'the',
	'and'
]);

/** `la voz de galicia` -> `La Voz de Galicia`; all-caps tokens such as `EMV` are kept. */
export function titleCase(words: string[]): string {
	return words
		.map((word, index) => {
			const lower = word.toLowerCase();
			const acronym = word.length > 1 && word === word.toUpperCase() && /\p{Lu}/u.test(word);
			if (acronym && !SMALL_WORDS.has(lower)) return word;
			if (index > 0 && SMALL_WORDS.has(lower)) return lower;
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.join(' ');
}
