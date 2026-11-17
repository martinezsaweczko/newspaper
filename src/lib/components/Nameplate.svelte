<script lang="ts">
	import { resolve } from '$app/paths';
	/** The paper's nameplate: the product name set like a masthead over a double rule. */
	let {
		size = 'stand',
		link = true
	}: {
		/** `stand` on app pages, `cover` on the login page. */
		size?: 'stand' | 'cover';
		/** Link the wordmark to the stand (off on the login page). */
		link?: boolean;
	} = $props();
</script>

<div class="text-center">
	<p
		class={[
			'font-serif leading-[0.9] font-extrabold tracking-[-0.035em] text-ink [font-variation-settings:"opsz"_72]',
			size === 'cover' ? 'text-[56px] sm:text-[76px]' : 'text-[40px] sm:text-[60px]'
		]}
	>
		{#if link}
			<a href={resolve('/')} class="rounded-sm">NewsPaper</a>
		{:else}
			NewsPaper
		{/if}
	</p>
	<div class="double-rule mt-3 sm:mt-4" aria-hidden="true"></div>
</div>
