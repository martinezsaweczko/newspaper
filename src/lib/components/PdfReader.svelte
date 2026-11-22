<script lang="ts">
	import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
	import { onMount, tick } from 'svelte';

	/**
	 * Renders a PDF in the page with pdf.js: one canvas per page, drawn only while it is near the
	 * viewport (and freed when it leaves, so a 100-page edition does not hold 100 bitmaps), plus a
	 * progress bar fed by the download.
	 */
	let {
		src,
		label,
		fallback
	}: {
		/** Same-origin URL of the PDF (`/pdf/[id]`). */
		src: string;
		/** Accessible name of the pages region, e.g. "El País, 17/11/2026". */
		label: string;
		/** Shown when pdf.js cannot open the file: links to the browser viewer and the download. */
		fallback: import('svelte').Snippet;
	} = $props();

	const MAX_WIDTH = 1100; // px at 100 %: a broadsheet page fills a laptop screen without zooming
	const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

	let status: 'loading' | 'ready' | 'error' = $state('loading');
	/** Fraction of the file downloaded, or null while the size is unknown. */
	let progress: number | null = $state(0);
	let downloading = $state(true);
	let pageCount = $state(0);
	let current = $state(1);
	let zoomIndex = $state(ZOOMS.indexOf(1));
	let frameWidth = $state(0);
	/** Height/width of each page; page 1's until a page reports its own. */
	let ratios: number[] = $state([]);

	const zoom = $derived(ZOOMS[zoomIndex]);
	const pageWidth = $derived(Math.max(200, Math.round(Math.min(frameWidth, MAX_WIDTH) * zoom)));
	const percent = $derived(progress === null ? null : Math.round(progress * 100));

	let doc: PDFDocumentProxy | null = null;
	let list: HTMLOListElement | undefined = $state();
	const slotAt = (index: number) => list?.children[index] as HTMLElement | undefined;
	const canvasAt = (index: number) => slotAt(index)?.querySelector('canvas') ?? undefined;
	// Render bookkeeping, deliberately not reactive: nothing in the markup reads it.
	/* eslint-disable svelte/prefer-svelte-reactivity */
	const tasks = new Map<number, RenderTask>();
	const near = new Set<number>();
	const drawnAt = new Map<number, number>(); // page → width it was drawn at
	/* eslint-enable svelte/prefer-svelte-reactivity */

	onMount(() => {
		let task: PDFDocumentLoadingTask | null = null;
		let cancelled = false;

		(async () => {
			try {
				const pdfjs = await import('pdfjs-dist');
				const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
				pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
				// 1 MB pieces: a 30 MB edition in ~30 requests instead of ~470 of the 64 KB default
				task = pdfjs.getDocument({ url: src, rangeChunkSize: 1 << 20 });
				task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
					progress = total > 0 ? Math.min(1, loaded / total) : null;
					if (total > 0 && loaded >= total) downloading = false;
				};
				const loaded = await task.promise;
				if (cancelled) return;
				doc = loaded;
				const first = await loaded.getPage(1);
				const vp = first.getViewport({ scale: 1 });
				ratios = Array.from({ length: loaded.numPages }, () => vp.height / vp.width);
				pageCount = loaded.numPages;
				status = 'ready';
				// The whole file may already be here (small file, or served from cache).
				void loaded.getDownloadInfo().then(() => (downloading = false));
			} catch (err) {
				if (cancelled) return;
				console.warn('[reader] could not open the PDF', err);
				status = 'error';
				downloading = false;
			}
		})();

		return () => {
			cancelled = true;
			for (const t of tasks.values()) t.cancel();
			tasks.clear();
			void task?.destroy();
			doc = null;
		};
	});

	async function draw(index: number) {
		const canvas = canvasAt(index);
		if (!doc || !canvas || drawnAt.get(index) === pageWidth) return;
		tasks.get(index)?.cancel();
		const width = pageWidth;
		const page = await doc.getPage(index + 1);
		if (!near.has(index) || width !== pageWidth) return;
		const base = page.getViewport({ scale: 1 });
		const ratio = base.height / base.width;
		if (Math.abs(ratios[index] - ratio) > 0.001) ratios[index] = ratio;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const viewport = page.getViewport({ scale: (width / base.width) * dpr });
		canvas.width = Math.floor(viewport.width);
		canvas.height = Math.floor(viewport.height);
		const render = page.render({ canvas, viewport });
		tasks.set(index, render);
		try {
			await render.promise;
			drawnAt.set(index, width);
		} catch {
			// cancelled by a zoom change or by scrolling away
		} finally {
			if (tasks.get(index) === render) tasks.delete(index);
		}
	}

	function release(index: number) {
		tasks.get(index)?.cancel();
		tasks.delete(index);
		drawnAt.delete(index);
		const canvas = canvasAt(index);
		if (canvas) {
			canvas.width = 0;
			canvas.height = 0;
		}
	}

	// Draw the pages near the viewport; free the rest.
	$effect(() => {
		if (!list || pageCount === 0) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const index = Number((entry.target as HTMLElement).dataset.index);
					if (entry.isIntersecting) {
						near.add(index);
						void draw(index);
					} else {
						near.delete(index);
						release(index);
					}
				}
			},
			{ rootMargin: '150% 0px' }
		);
		for (const slot of list.children) observer.observe(slot);
		return () => observer.disconnect();
	});

	// The page counter: the page crossing the middle of the screen.
	$effect(() => {
		if (!list || pageCount === 0) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						current = Number((entry.target as HTMLElement).dataset.index) + 1;
					}
				}
			},
			{ rootMargin: '-50% 0px -50% 0px' }
		);
		for (const slot of list.children) observer.observe(slot);
		return () => observer.disconnect();
	});

	// Redraw what is on screen after a zoom or a resize.
	$effect(() => {
		void pageWidth;
		for (const index of near) void draw(index);
	});

	/** Zoom, keeping the same spot of the current page under the top of the screen. */
	async function setZoom(next: number) {
		const anchor = slotAt(current - 1);
		const before = anchor?.getBoundingClientRect();
		const fraction = before ? -before.top / before.height : 0;
		zoomIndex = Math.max(0, Math.min(ZOOMS.length - 1, next));
		await tick();
		if (!anchor || !before) return;
		const after = anchor.getBoundingClientRect();
		window.scrollBy({ top: after.top + fraction * after.height, behavior: 'instant' });
	}
</script>

{#if downloading && status !== 'error'}
	<div
		class="fixed inset-x-0 top-0 z-20 h-[3px] bg-hairline"
		role="progressbar"
		aria-label="Descarga de la edición"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={percent ?? undefined}
	>
		<div
			class={[
				'h-full bg-signal transition-[width] duration-200 ease-out',
				percent === null && 'w-1/3 animate-pulse'
			]}
			style:width={percent === null ? undefined : `${percent}%`}
		></div>
	</div>
{/if}

{#if status === 'ready'}
	<div
		class="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-hairline bg-paper/95 px-4 py-1.5 backdrop-blur-sm sm:-mx-8 sm:px-8"
	>
		<p class="text-[14px] text-ink-soft tabular-nums" aria-live="polite">
			Página <span class="text-ink">{current}</span> de {pageCount}
		</p>
		<div class="flex items-center gap-1" role="group" aria-label="Zoom">
			<button
				type="button"
				class="min-h-11 min-w-11 cursor-pointer rounded-[6px] text-[18px] text-ink hover:bg-shelf disabled:cursor-default disabled:opacity-40"
				onclick={() => setZoom(zoomIndex - 1)}
				disabled={zoomIndex === 0}
				aria-label="Reducir">−</button
			>
			<button
				type="button"
				class="min-h-11 min-w-16 cursor-pointer rounded-[6px] px-2 text-[14px] text-ink tabular-nums hover:bg-shelf"
				onclick={() => setZoom(ZOOMS.indexOf(1))}
				aria-label="Ajustar al ancho">{Math.round(zoom * 100)} %</button
			>
			<button
				type="button"
				class="min-h-11 min-w-11 cursor-pointer rounded-[6px] text-[18px] text-ink hover:bg-shelf disabled:cursor-default disabled:opacity-40"
				onclick={() => setZoom(zoomIndex + 1)}
				disabled={zoomIndex === ZOOMS.length - 1}
				aria-label="Ampliar">+</button
			>
		</div>
	</div>
{/if}

<div bind:clientWidth={frameWidth} class="w-full">
	{#if status === 'loading'}
		<div class="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
			<p class="font-serif text-[22px] font-semibold text-ink">Cargando la edición…</p>
			<div
				class="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-hairline"
				aria-hidden="true"
			>
				<div
					class={[
						'h-full bg-ink transition-[width] duration-200 ease-out',
						percent === null && 'w-1/3 animate-pulse'
					]}
					style:width={percent === null ? undefined : `${percent}%`}
				></div>
			</div>
			<p class="text-[14px] text-ink-soft tabular-nums">
				{percent === null ? 'Descargando…' : `${percent} %`}
			</p>
		</div>
	{:else if status === 'error'}
		<div class="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
			<p class="font-serif text-[22px] font-semibold text-ink">
				No se ha podido mostrar la edición.
			</p>
			{@render fallback()}
		</div>
	{:else}
		<section class="overflow-x-auto py-6" aria-label={label}>
			<ol bind:this={list} class="mx-auto flex w-max min-w-full flex-col items-center gap-6">
				{#each ratios as ratio, i (i)}
					<li
						data-index={i}
						class="front-page relative bg-sheet"
						style:width={`${pageWidth}px`}
						style:height={`${Math.round(pageWidth * ratio)}px`}
					>
						<canvas class="block h-full w-full" aria-label={`Página ${i + 1}`}></canvas>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
</div>
