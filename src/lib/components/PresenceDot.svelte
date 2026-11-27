<script lang="ts">
	/** The green/red online dot. Decorative: the text next to it always says the same. */
	let { online, size = 'sm' }: { online: boolean | null; size?: 'sm' | 'md' } = $props();
</script>

<span
	aria-hidden="true"
	class={[
		'inline-block flex-none rounded-full',
		size === 'sm' ? 'size-2' : 'size-2.5',
		online === null ? 'bg-control' : online ? 'bg-online' : 'bg-offline'
	]}
></span>
