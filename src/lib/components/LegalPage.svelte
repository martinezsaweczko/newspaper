<script lang="ts">
	import { formatDate } from '#lib/format/date.ts';
	import type { CurrentUser } from '#lib/types.ts';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import SiteHeader from './SiteHeader.svelte';

	/**
	 * The frame of a public legal page (/privacidad, /condiciones): the site header, a reading
	 * column with the title and its last-updated line, and a way back. The text lives in the route.
	 */
	let {
		user,
		kind,
		title,
		description,
		updated,
		children
	}: {
		user: CurrentUser | null;
		/** Which page this is: the footer links to the other one. */
		kind: 'privacy' | 'terms';
		title: string;
		/** The meta description. */
		description: string;
		/** ISO date of the last change to the text. */
		updated: string;
		children: Snippet;
	} = $props();

	/** Back to wherever this visitor belongs: the stand, their account notice, or the login. */
	const back = $derived(
		!user
			? { href: resolve('/login'), label: 'Ir a iniciar sesión' }
			: user.status === 'pending'
				? { href: resolve('/pendiente'), label: 'Volver a tu solicitud' }
				: user.status === 'blocked'
					? { href: resolve('/bloqueado'), label: 'Volver a tu cuenta' }
					: { href: resolve('/'), label: 'Volver al quiosco' }
	);
	const other = $derived(
		kind === 'privacy'
			? { href: resolve('/condiciones'), label: 'Condiciones del servicio' }
			: { href: resolve('/privacidad'), label: 'Política de privacidad' }
	);
</script>

<svelte:head>
	<title>{title} · NewsPaper</title>
	<meta name="description" content={description} />
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 sm:px-8">
	<SiteHeader {user} skipLabel="Saltar al texto" />
	<main id="main" class="mx-auto max-w-[68ch] pt-10 pb-20 sm:pt-14">
		<h1 class="font-serif text-[28px] leading-tight font-semibold text-balance sm:text-[32px]">
			{title}
		</h1>
		<p class="mt-4 border-b border-ink pb-3 text-[14px] text-ink-soft tabular-nums">
			Última actualización: {formatDate(updated)}
		</p>
		<div class="legal mt-8">
			{@render children()}
		</div>
		<nav
			aria-label="Más información"
			class="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-hairline pt-4 text-[15px]"
		>
			<a
				href={back.href}
				class="-my-1 flex min-h-11 items-center font-medium text-ink underline underline-offset-4"
				>{back.label}</a
			>
			<a
				href={other.href}
				class="-my-1 flex min-h-11 items-center text-ink-soft underline-offset-4 hover:text-ink hover:underline"
				>{other.label}</a
			>
		</nav>
	</main>
</div>

<style>
	/* Long-form reading: Geist body at a comfortable measure, Newsreader section heads. */
	.legal {
		font-size: 17px;
		line-height: 1.65;
		color: var(--t-ink);
	}
	.legal :global(h2) {
		margin-top: 2.25rem;
		font-family: var(--font-serif);
		font-size: 24px;
		line-height: 1.2;
		font-weight: 600;
		text-wrap: balance;
	}
	.legal :global(h2:first-child) {
		margin-top: 0;
	}
	.legal :global(p),
	.legal :global(ul) {
		margin-top: 0.75rem;
	}
	.legal :global(ul) {
		padding-left: 1.25rem;
		list-style: disc;
	}
	.legal :global(li + li) {
		margin-top: 0.5rem;
	}
	.legal :global(li::marker) {
		color: var(--t-ink-soft);
	}
	.legal :global(strong) {
		font-weight: 600;
	}
	.legal :global(a) {
		text-decoration: underline;
		text-underline-offset: 3px;
		overflow-wrap: anywhere;
	}
	@media (max-width: 639px) {
		.legal {
			font-size: 16px;
		}
		.legal :global(h2) {
			font-size: 22px;
		}
	}
</style>
