<script lang="ts">
	import Nameplate from './Nameplate.svelte';

	let { user }: { user: string | null } = $props();
</script>

<a
	href="#main"
	class="sr-only rounded-[6px] bg-ink px-3 py-2 text-[14px] text-on-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10"
	>Skip to the papers</a
>
<header class="pt-3 sm:pt-4">
	<div class="flex items-center justify-between gap-4 text-[13px] text-ink-soft">
		<span>Private newsstand</span>
		{#if user}
			<form method="POST" action="/logout" class="flex items-center gap-3">
				<span class="hidden sm:inline">Signed in as <span class="text-ink">{user}</span></span>
				<button
					type="submit"
					class="-my-2 min-h-11 cursor-pointer rounded-[6px] px-2 text-ink underline-offset-4 hover:underline"
				>
					Sign out
				</button>
			</form>
		{/if}
	</div>
	<div class="mt-1 sm:mt-0">
		<Nameplate />
	</div>
</header>
