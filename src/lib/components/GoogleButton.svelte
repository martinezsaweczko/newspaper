<script lang="ts">
	/**
	 * The standard "Sign in with Google" button, after Google's sign-in branding guidelines: the
	 * unaltered four-colour "G" (20px) on a white (dark: #131314) surface with a grey 1px border,
	 * 12px between logo and label. Colours come from the --t-google-* tokens, the documented brand
	 * exception in DESIGN.md. Disabled, it is a real disabled <button> with its reason below.
	 */
	let {
		href,
		label,
		disabled = false,
		hint
	}: { href: string; label: string; disabled?: boolean; hint?: string } = $props();

	const hintId = $props.id();
	const base =
		'flex h-12 w-full items-center justify-center gap-3 rounded-[6px] border border-google-border bg-google-surface px-4 text-base font-medium text-google-text';
</script>

{#snippet logo()}
	<svg
		aria-hidden="true"
		focusable="false"
		viewBox="0 0 48 48"
		width="20"
		height="20"
		class="size-5 shrink-0"
	>
		<path
			class="fill-google-red"
			d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
		/>
		<path
			class="fill-google-blue"
			d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
		/>
		<path
			class="fill-google-yellow"
			d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
		/>
		<path
			class="fill-google-green"
			d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
		/>
	</svg>
{/snippet}

{#if disabled}
	<div class="flex flex-col gap-2">
		<button
			type="button"
			disabled
			aria-describedby={hint ? hintId : undefined}
			class={[base, 'cursor-not-allowed opacity-60']}
		>
			{@render logo()}<span>{label}</span>
		</button>
		{#if hint}
			<p id={hintId} class="text-[13px] leading-snug text-ink-soft">{hint}</p>
		{/if}
	</div>
{:else}
	<!-- a full page load: the route answers with a redirect to the provider. `href` arrives already
	     built with resolve() by the caller (it carries a query string). -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a {href} data-sveltekit-reload class={[base, 'transition-colors hover:bg-google-hover']}>
		{@render logo()}<span>{label}</span>
	</a>
{/if}
