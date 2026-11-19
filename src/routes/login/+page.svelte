<script lang="ts">
	import Nameplate from '#lib/components/Nameplate.svelte';
	import { formatDateline } from '#lib/format/date.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let submitting = $state(false);
	const failed = $derived(Boolean(form?.message));
	// After a failed sign-in, focus lands where the fix is typed: the password (it is never sent
	// back, so it is always empty) when the username came back filled, else the username. Set as
	// `autofocus` so the server-rendered page focuses it without JS too.
	const focusPassword = $derived(failed && Boolean(form?.username));
</script>

<svelte:head>
	<title>Iniciar sesión · NewsPaper</title>
</svelte:head>

<main class="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-4 py-10 sm:px-8">
	<Nameplate size="cover" link={false} />
	<div class="flex justify-between gap-4 border-b border-ink py-2 text-[13px] text-ink">
		<span>{formatDateline(data.today)}</span>
		<span>Solo para suscriptores</span>
	</div>

	<form method="POST" class="mt-10 flex flex-col gap-5" onsubmit={() => (submitting = true)}>
		<h1 class="font-serif text-[24px] leading-tight font-semibold">
			Inicia sesión para leer los periódicos de hoy
		</h1>
		<input type="hidden" name="next" value={data.next} />

		<div class="flex flex-col gap-2">
			<label for="username" class="text-[14px] font-medium">Usuario</label>
			<!-- Uncontrolled (defaultValue): a controlled value={...} was re-applied as '' when onsubmit
			     flipped `submitting`, so the browser posted an empty username. -->
			<!-- svelte-ignore a11y_autofocus (only after a failed submit: focus goes to the field to fix) -->
			<input
				id="username"
				name="username"
				type="text"
				autocomplete="username"
				autocapitalize="none"
				spellcheck="false"
				required
				defaultValue={form?.username ?? ''}
				aria-invalid={failed ? 'true' : undefined}
				aria-describedby={failed ? 'login-error' : undefined}
				autofocus={failed && !focusPassword}
				class="h-12 rounded-[6px] border border-control bg-sheet px-3 text-base text-ink"
			/>
		</div>

		<div class="flex flex-col gap-2">
			<label for="password" class="text-[14px] font-medium">Contraseña</label>
			<!-- svelte-ignore a11y_autofocus (only after a failed submit: focus goes to the field to fix) -->
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				aria-invalid={failed ? 'true' : undefined}
				aria-describedby={failed ? 'login-error' : undefined}
				autofocus={focusPassword}
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
			{submitting ? 'Entrando…' : 'Entrar'}
		</button>

		<p class="text-[14px] text-ink-soft">
			¿No tienes cuenta? Pide a quien gestiona este quiosco que te dé de alta.
		</p>
	</form>
</main>
