<script lang="ts">
	import Nameplate from '#lib/components/Nameplate.svelte';
	import { formatLongDate } from '#lib/format/date.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in · NewsPaper</title>
</svelte:head>

<main class="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-4 py-10 sm:px-8">
	<Nameplate size="cover" link={false} />
	<div class="flex justify-between gap-4 border-b border-ink py-2 text-[13px] text-ink">
		<span>{formatLongDate(data.today)}</span>
		<span>Subscribers only</span>
	</div>

	<form
		method="POST"
		class="mt-10 flex flex-col gap-5"
		onsubmit={() => (submitting = true)}
		aria-describedby={form?.message ? 'login-error' : undefined}
	>
		<h1 class="font-serif text-[24px] leading-tight font-semibold">
			Sign in to read today’s papers
		</h1>
		<input type="hidden" name="next" value={data.next} />

		<div class="flex flex-col gap-2">
			<label for="username" class="text-[14px] font-medium">Username</label>
			<input
				id="username"
				name="username"
				type="text"
				autocomplete="username"
				autocapitalize="none"
				spellcheck="false"
				required
				value={form?.username ?? ''}
				class="h-12 rounded-[6px] border border-control bg-sheet px-3 text-base text-ink"
			/>
		</div>

		<div class="flex flex-col gap-2">
			<label for="password" class="text-[14px] font-medium">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				class="h-12 rounded-[6px] border border-control bg-sheet px-3 text-base text-ink"
			/>
		</div>

		<div aria-live="polite">
			{#if form?.message}
				<p id="login-error" class="text-[14px] font-medium text-error">{form.message}</p>
			{/if}
		</div>

		<button
			type="submit"
			disabled={submitting}
			class="h-12 cursor-pointer rounded-[6px] bg-ink text-base font-medium text-on-ink transition-opacity hover:opacity-90 disabled:cursor-progress disabled:opacity-70"
		>
			{submitting ? 'Signing in…' : 'Sign in'}
		</button>

		<p class="text-[14px] text-ink-soft">No account? Ask whoever runs this newsstand to add you.</p>
	</form>
</main>
