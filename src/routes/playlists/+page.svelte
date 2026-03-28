<!--
	@component My Playlists Page

	Displays all user-created playlists (system playlists like Liked Videos and
	Watch Later are excluded). All data is loaded server-side and cached for 24h,
	since playlists rarely change.
-->
<script lang="ts">
	import PlaylistCard from '$lib/components/PlaylistCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>My Playlists - Shortless</title>
</svelte:head>

<div class="mx-auto max-w-screen-xl px-4 py-4">
	<h1 class="mb-4 text-xl font-bold">My Playlists</h1>

	{#if data.playlists.length > 0}
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.playlists as playlist (playlist.id)}
				<PlaylistCard {playlist} />
			{/each}
		</div>
	{:else}
		<p class="text-yt-text-secondary py-8 text-center">No playlists found.</p>
	{/if}
</div>
