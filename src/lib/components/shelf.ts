/**
 * The stand's column grid: 2 columns on a phone, 3 / 4 / 5 as the screen widens. Regions are laid
 * side by side on these columns like a newspaper's column heads; a region spans as many columns as
 * it has papers (up to the row) and wraps its papers on a subgrid so every front page lines up.
 * Class names are spelled out in full so Tailwind can see them.
 */
export const SHELF_GRID =
	'grid grid-cols-2 gap-x-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-x-7';

const BASE = ['col-span-1', 'col-span-2'];
const MD = ['md:col-span-1', 'md:col-span-2', 'md:col-span-3'];
const LG = ['lg:col-span-1', 'lg:col-span-2', 'lg:col-span-3', 'lg:col-span-4'];
const XL = ['xl:col-span-1', 'xl:col-span-2', 'xl:col-span-3', 'xl:col-span-4', 'xl:col-span-5'];

/** Column span classes for a region holding `count` papers. */
export function shelfSpan(count: number): string {
	const pick = (list: string[]) => list[Math.min(Math.max(count, 1), list.length) - 1];
	return [pick(BASE), pick(MD), pick(LG), pick(XL)].join(' ');
}
