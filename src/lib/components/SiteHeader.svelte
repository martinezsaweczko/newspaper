<script lang="ts">
	import type { CurrentUser } from '#lib/types.ts';
	import { resolve } from '$app/paths';
	import Nameplate from './Nameplate.svelte';

	let {
		user,
		skipLabel = 'Saltar a los periódicos'
	}: { user: CurrentUser | null; skipLabel?: string } = $props();
	const reader = $derived(user?.status === 'approved');
</script>

<a
	href="#main"
	class="sr-only rounded-[6px] bg-ink px-3 py-2 text-[14px] text-on-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10"
	>{skipLabel}</a
>
<header class="pt-3 sm:pt-4">
	<div class="flex items-center justify-between gap-4 text-[13px] text-ink-soft">
		<span>Quiosco privado</span>
		{#if user}
			<div class="flex items-center gap-3">
				<span class="hidden sm:inline"
					>Sesión iniciada como <span class="text-ink">{user.name}</span></span
				>
				{#if reader && user.role === 'admin'}
					<a
						href={resolve('/admin')}
						class="-my-2 flex min-h-11 items-center rounded-[6px] px-2 text-ink underline-offset-4 hover:underline"
						>Administración</a
					>
				{/if}
				<form method="POST" action="/logout">
					<button
						type="submit"
						class="-my-2 min-h-11 cursor-pointer rounded-[6px] px-2 text-ink underline-offset-4 hover:underline"
					>
						Cerrar sesión
					</button>
				</form>
			</div>
		{/if}
	</div>
	<div class="mt-1 sm:mt-0">
		<Nameplate />
	</div>
</header>
