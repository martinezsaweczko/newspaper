<script lang="ts">
	import GoogleButton from '#lib/components/GoogleButton.svelte';
	import Nameplate from '#lib/components/Nameplate.svelte';
	import PrivacyNotice from '#lib/components/PrivacyNotice.svelte';
	import { formatDateline } from '#lib/format/date.ts';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let submitting = $state(false);
	const failed = $derived(Boolean(form?.message));
	// After a failed sign-in, focus lands where the fix is typed: the password (it is never sent
	// back, so it is always empty) when the username came back filled, else the username. Set as
	// `autofocus` so the server-rendered page focuses it without JS too.
	const focusPassword = $derived(failed && Boolean(form?.username));
	/** Both buttons run the same flow; registering asks Google for its account chooser. */
	const googleHref = (intent?: 'register') => {
		const query = [
			data.next === '/' ? '' : `next=${encodeURIComponent(data.next)}`,
			intent ? `intent=${intent}` : ''
		].filter(Boolean);
		return `${resolve('/auth/google')}${query.length ? `?${query.join('&')}` : ''}`;
	};
	const googleOn = $derived(data.google === 'on');
	const googleShown = $derived(data.google !== 'off');
	const googleHint =
		'Google no está configurado: añade GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y PUBLIC_ORIGIN en .env';
	// The admin form is the only way in without Google, and stays open after a failed attempt.
	const adminOpen = $derived(!googleOn || failed);
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

	<section class="mt-10 flex flex-col gap-5" aria-labelledby="login-title">
		<h1 id="login-title" class="font-serif text-[24px] leading-tight font-semibold">
			Inicia sesión para leer los periódicos de hoy
		</h1>

		{#if googleShown}
			<GoogleButton
				href={googleHref()}
				label="Iniciar sesión con Google"
				disabled={!googleOn}
				hint={googleOn ? undefined : googleHint}
			/>

			<div class="mt-3 flex flex-col gap-3">
				<p class="text-[14px] font-medium text-ink">¿No tienes cuenta?</p>
				<GoogleButton
					href={googleHref('register')}
					label="Registrarse con Google"
					disabled={!googleOn}
				/>
				<p class="text-[14px] leading-snug text-ink-soft">
					Te registras con tu cuenta de Google; un administrador aprobará tu acceso.
				</p>
			</div>
		{/if}

		<div aria-live="polite">
			{#if data.googleError}
				<p class="text-[14px] font-medium text-error">{data.googleError}</p>
			{/if}
		</div>
	</section>

	{#if googleShown}
		<div class="mt-8 flex items-center gap-3 text-[13px] text-ink-soft" aria-hidden="true">
			<span class="h-px flex-1 bg-hairline"></span>o<span class="h-px flex-1 bg-hairline"></span>
		</div>
	{/if}

	<details
		class={['group', googleShown ? 'mt-2' : 'mt-8 border-t border-hairline pt-4']}
		open={adminOpen}
	>
		<summary
			class="-mx-1 flex min-h-11 cursor-pointer list-none items-center rounded-[6px] px-1 text-[14px] font-medium text-ink [&::-webkit-details-marker]:hidden"
		>
			<span
				aria-hidden="true"
				class="mr-2 inline-block w-3 text-ink-soft transition-transform group-open:rotate-90"
				>›</span
			>Acceso de administración
		</summary>
		<form method="POST" class="mt-3 flex flex-col gap-5" onsubmit={() => (submitting = true)}>
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
				class={[
					'h-12 cursor-pointer rounded-[6px] text-base font-medium transition-opacity disabled:cursor-progress disabled:opacity-70',
					googleOn
						? 'border border-ink bg-transparent text-ink hover:bg-shelf'
						: 'bg-ink text-on-ink hover:opacity-90'
				]}
			>
				{submitting ? 'Entrando…' : 'Entrar'}
			</button>
		</form>
	</details>

	<PrivacyNotice class="mt-8" />
	<nav
		aria-label="Información legal"
		class="mt-3 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-soft"
	>
		<a
			href={resolve('/privacidad')}
			class="-my-3 flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline"
			>Política de privacidad</a
		>
		<span aria-hidden="true">·</span>
		<a
			href={resolve('/condiciones')}
			class="-my-3 flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline"
			>Condiciones del servicio</a
		>
	</nav>
</main>
