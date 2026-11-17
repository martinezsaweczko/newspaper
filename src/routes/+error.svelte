<script lang="ts">
	import Nameplate from '#lib/components/Nameplate.svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} · NewsPaper</title>
</svelte:head>

<div class="mx-auto max-w-[1440px] px-4 pt-4 sm:px-8">
	<Nameplate />
	<main class="mt-10 max-w-[60ch] pb-24">
		<h1 class="font-serif text-[28px] leading-tight font-semibold">
			{page.status === 404 ? 'This page is not on the stand' : 'Something went wrong'}
		</h1>
		<p class="mt-3 text-base text-ink">
			{page.error?.message ?? 'Unexpected error.'}
			<a href={resolve('/')} class="underline underline-offset-4">Back to today’s papers</a>
		</p>
	</main>
</div>
