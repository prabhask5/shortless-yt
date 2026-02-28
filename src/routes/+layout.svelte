<!--
	@component Root Layout

	Wraps every page with the global app shell: the Header and a full-height
	flex column so the main content stretches to fill the viewport.

	Key responsibilities:
	- Imports global CSS (`app.css`) once for the entire app.
	- Syncs server-provided user data (from `+layout.server.ts`) into the
	  client-side `authState` store so that non-page components (e.g. the
	  Header avatar menu) can reactively read auth status without prop drilling.
	- Extracts the current search query `q` from the URL so the Header search
	  bar stays in sync when navigating between pages.
	- Shows a prominent banner when the YouTube API daily quota is exhausted.
	- Shows a YouTube-style loading bar during navigation.
-->
<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/Header.svelte';
	import ReloadPrompt from '$lib/components/ReloadPrompt.svelte';
	import { authState } from '$lib/stores/auth';
	import { page } from '$app/stores';
	import { navigating } from '$app/stores';
	import { invalidateAll } from '$app/navigation';

	let { children } = $props();

	// Keep the Header search bar in sync with the current `q` query param
	let query = $derived($page.url.searchParams.get('q') ?? '');

	// Quota exhaustion state from layout server load
	let quotaExhausted = $derived(!!$page.data.quotaExhausted);

	// Navigation loading state
	let isNavigating = $derived(!!$navigating);

	/* Sync server auth state to the client-side store on every navigation.
	 * The layout server load provides `data.user` (or null), and this effect
	 * mirrors that into the reactive `authState` store so any component in
	 * the tree can read it without needing access to page data. */
	$effect(() => {
		const data = $page.data;
		if (data.user) {
			authState.set({
				user: { avatarUrl: data.user.avatarUrl, channelTitle: data.user.channelTitle },
				isLoading: false
			});
		} else {
			authState.set({ user: null, isLoading: false });
		}
	});
</script>

<!-- Navigation loading bar — YouTube-style red progress bar at the top of the viewport -->
{#if isNavigating}
	<div class="fixed top-0 right-0 left-0 z-[100] h-1">
		<div
			class="bg-yt-accent h-full animate-[loading_1.5s_ease-in-out_infinite] rounded-r-full"
		></div>
	</div>
{/if}

<!-- App shell: full-height flex column with sticky header and stretchy main -->
<div class="bg-yt-bg text-yt-text flex min-h-screen flex-col">
	<Header user={$authState.user} {query} onRefresh={() => invalidateAll()} />

	{#if quotaExhausted}
		<div class="border-b border-yellow-600/30 bg-yellow-900/30 px-4 py-3 text-center">
			<p class="text-sm text-yellow-200">
				<span class="mr-1 font-semibold">Daily limit reached.</span>
				Shortless YouTube has used its YouTube API quota for today. Some data may be missing or stale.
				The quota resets automatically at midnight Pacific Time.
			</p>
		</div>
	{/if}

	<main class="flex-1">
		{@render children()}
	</main>
	<ReloadPrompt />
</div>

<style>
	@keyframes loading {
		0% {
			width: 0%;
		}
		50% {
			width: 70%;
		}
		100% {
			width: 95%;
		}
	}
</style>
