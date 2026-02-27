<!--
	@component Error Page

	Displays a user-friendly error message. Special handling for quota-related
	errors (when page loads fail entirely due to exhausted YouTube API quota).
-->
<script lang="ts">
	import { page } from '$app/stores';

	let isQuotaError = $derived(
		$page.status === 500 &&
			($page.error?.message?.includes('quota') || $page.error?.message?.includes('Quota'))
	);
</script>

<svelte:head>
	<title>{isQuotaError ? 'Daily Limit Reached' : `Error ${$page.status}`} - Shortless YouTube</title
	>
</svelte:head>

<div class="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
	{#if isQuotaError}
		<svg class="text-yt-text-secondary mb-4 h-16 w-16" fill="currentColor" viewBox="0 0 24 24">
			<path
				d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
			/>
		</svg>
		<h1 class="text-yt-text mb-2 text-2xl font-bold sm:text-3xl">Daily Limit Reached</h1>
		<p class="text-yt-text-secondary mb-6 max-w-md text-sm sm:text-base">
			Shortless YouTube has hit its YouTube API daily quota. The quota resets at midnight Pacific
			Time. Cached pages may still work — try going back or visiting a page you've already loaded.
		</p>
		<a
			href="/"
			class="bg-yt-surface hover:bg-yt-surface-hover text-yt-text rounded-full px-6 py-2 text-sm font-medium"
		>
			Go home
		</a>
	{:else}
		<h1 class="text-yt-text mb-2 text-5xl font-bold">{$page.status}</h1>
		<p class="text-yt-text-secondary mb-4 text-lg">
			{$page.error?.message ?? 'Something went wrong'}
		</p>
		<a
			href="/"
			class="bg-yt-surface hover:bg-yt-surface-hover text-yt-text rounded-full px-6 py-2 text-sm font-medium"
		>
			Go home
		</a>
	{/if}
</div>
