<script lang="ts">
	/** The sections of /admin: underline tabs on one hairline, Usuarios carrying the pending queue. */
	import { resolve } from '$app/paths';

	let { current, pending = 0 }: { current: 'resumen' | 'lecturas' | 'usuarios'; pending?: number } =
		$props();

	const SECTIONS = [
		{ id: 'resumen', label: 'Resumen', href: resolve('/admin') },
		{ id: 'lecturas', label: 'Lecturas', href: resolve('/admin/lecturas') },
		{ id: 'usuarios', label: 'Usuarios', href: resolve('/admin/usuarios') }
	] as const;
</script>

<nav aria-label="Administración" class="mt-3 border-b border-hairline">
	<ul class="-mb-px flex gap-5 overflow-x-auto text-[14px]">
		{#each SECTIONS as section (section.id)}
			{@const active = section.id === current}
			<li>
				<a
					href={section.href}
					aria-current={active ? 'page' : undefined}
					class={[
						'flex min-h-11 items-center gap-2 border-b-2 whitespace-nowrap',
						active
							? 'border-ink font-medium text-ink'
							: 'border-transparent text-ink-soft hover:text-ink'
					]}
				>
					{section.label}
					{#if section.id === 'usuarios' && pending > 0}
						<span
							class="min-w-5 flex-none rounded-full bg-ink px-1.5 text-center text-[12px] leading-5 text-on-ink tabular-nums"
							>{pending}<span class="sr-only"> pendientes</span></span
						>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>
