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
-->
<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/Header.svelte';
	import { authState } from '$lib/stores/auth';
	import { page } from '$app/stores';

	let { children } = $props();

	// Keep the Header search bar in sync with the current `q` query param
	let query = $derived($page.url.searchParams.get('q') ?? '');

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

<!-- App shell: full-height flex column with sticky header and stretchy main -->
<div class="bg-yt-bg text-yt-text flex min-h-screen flex-col">
	<Header user={$authState.user} {query} />
	<main class="flex-1">
		{@render children()}
	</main>
</div>
