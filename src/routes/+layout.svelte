<script lang="ts">
	import '@fontsource-variable/newsreader/opsz.css';
	import '@fontsource-variable/geist';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import ChatWidget from '#lib/components/ChatWidget.svelte';
	import { connectLive } from '#lib/chat/live.svelte.ts';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	// Pages that already link the legal texts in their own content (or are them).
	const OWN_LINKS = new Set(['/login', '/pendiente', '/bloqueado', '/privacidad', '/condiciones']);
	const footer = $derived(Boolean(data.user) && !OWN_LINKS.has(page.route.id ?? ''));

	// One live channel for the whole visit (approved accounts only): who is online.
	const live = $derived(data.user?.status === 'approved');
	/** Readers (not admins: they answer from Administración → Mensajes) get the chat button. */
	const chat = $derived(live && data.user?.kind === 'google' && data.user.role === 'user');
	$effect(() => {
		if (live) return connectLive(data.user?.role === 'admin' ? 'out' : 'in');
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{@render children()}

{#if chat}
	<ChatWidget />
{/if}

{#if footer}
	<footer class="mx-auto max-w-[1440px] px-4 pb-6 sm:px-8">
		<nav
			aria-label="Información legal"
			class="flex flex-wrap items-center gap-x-2 border-t border-hairline pt-2 text-[13px] text-ink-soft"
		>
			<a
				href={resolve('/privacidad')}
				class="flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline"
				>Política de privacidad</a
			>
			<span aria-hidden="true">·</span>
			<a
				href={resolve('/condiciones')}
				class="flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline"
				>Condiciones del servicio</a
			>
		</nav>
	</footer>
{/if}
