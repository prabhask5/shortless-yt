<!--
	@component Liked Videos Page

	Displays the authenticated user's liked videos in a responsive grid.
	Uses the same VirtualFeed + responsive column pattern as the home and
	channel pages. When the video list is empty (either still loading or
	the user has no liked videos), skeleton placeholders are shown to
	prevent layout shift and indicate loading state.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let columns = $state(1);

	/* Responsive column calculation: 3 columns on desktop, 2 on tablet, 1 on mobile */
	$effect(() => {
		function updateColumns() {
			const w = window.innerWidth;
			if (w >= 1024) columns = 3;
			else if (w >= 640) columns = 2;
			else columns = 1;
		}
		updateColumns();
		window.addEventListener('resize', updateColumns);
		return () => window.removeEventListener('resize', updateColumns);
	});
</script>

<svelte:head>
	<title>Liked Videos - Shortless YouTube</title>
</svelte:head>

<div class="mx-auto max-w-screen-xl px-4 py-4">
	<h1 class="mb-4 text-xl font-bold">Liked Videos</h1>

	{#if data.videos.length > 0}
		<VirtualFeed
			items={data.videos}
			{columns}
			estimateRowHeight={columns === 1 ? 300 : 280}
			gap={16}
		>
			{#snippet children(video)}
				<VideoCard {video} />
			{/snippet}
		</VirtualFeed>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _unused, i (i)}
				<Skeleton variant="video-card" />
			{/each}
		</div>
	{/if}
</div>
