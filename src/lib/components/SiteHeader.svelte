<script lang="ts">
	import type { CurrentUser } from '#lib/types.ts';
	import { presence } from '#lib/chat/presence.svelte.ts';
	import { userLabel } from '#lib/user-label.ts';
	import { resolve } from '$app/paths';
	import Nameplate from './Nameplate.svelte';
	import PresenceDot from './PresenceDot.svelte';

	let {
		user,
		skipLabel = 'Saltar a los periódicos'
	}: { user: CurrentUser | null; skipLabel?: string } = $props();
	const reader = $derived(user?.status === 'approved');
	const admin = $derived(reader && user?.role === 'admin');
	/** Admins: everyone online but themselves. */
	const others = $derived(
		user ? presence.online.filter((key) => key !== userLabel(user)).length : 0
	);
</script>

<a
	href="#main"
	class="sr-only rounded-[6px] bg-ink px-3 py-2 text-[14px] text-on-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10"
	>{skipLabel}</a
>
<header class="pt-3 sm:pt-4">
	<div class="flex items-center justify-between gap-4 text-[13px] text-ink-soft">
		<div class="flex min-w-0 items-center gap-3">
			<span class="hidden sm:inline">Quiosco privado</span>
			{#if reader && presence.admins !== null}
				{#if admin}
					<a
						href={resolve('/admin/conectados')}
						class="-my-2 flex min-h-11 items-center gap-2 rounded-[6px] px-2 underline-offset-4 hover:text-ink hover:underline"
					>
						<PresenceDot online={others > 0} />
						<span class="tabular-nums"
							>{others === 0
								? 'Nadie más en línea'
								: others === 1
									? '1 persona más en línea'
									: `${others} personas más en línea`}</span
						>
					</a>
				{:else}
					<span class="flex items-center gap-2" role="status">
						<PresenceDot online={presence.admins} />
						{presence.admins ? 'Administración en línea' : 'Administración desconectada'}
					</span>
				{/if}
			{:else}
				<span class="sm:hidden">Quiosco privado</span>
			{/if}
		</div>
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
