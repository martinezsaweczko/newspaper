<script lang="ts">
	import '@fontsource-variable/newsreader/opsz.css';
	import '@fontsource-variable/geist';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{@render children()}
