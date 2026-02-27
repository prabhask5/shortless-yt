<!--
	@component Liked Videos Page

	Displays the authenticated user's liked videos with streaming skeletons
	and infinite scroll pagination.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { useColumns } from '$lib/stores/columns.svelte';
	import type { VideoItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cols = useColumns(3);

	/* ── Infinite scroll state ── */
	let allVideos = $state<VideoItem[]>([]);
	let nextPageToken = $state<string | undefined>(undefined);
	let loadingMore = $state(false);

	$effect(() => {
		data.streamed.likedData.then((likedData) => {
			allVideos = likedData.videos;
			nextPageToken = likedData.nextPageToken;
		});
	});

	/* Auto-load if first page was entirely filtered out (e.g. all shorts) */
	$effect(() => {
		if (allVideos.length === 0 && nextPageToken && !loadingMore) {
			loadMore();
		}
	});

	async function loadMore() {
		if (!nextPageToken || loadingMore) return;
		loadingMore = true;
		try {
			const params = new URLSearchParams({
				source: 'liked',
				pageToken: nextPageToken
			});
			const res = await fetch(`/api/videos?${params}`);
			const json = await res.json();
			allVideos = [...allVideos, ...json.items];
			nextPageToken = json.nextPageToken;
		} finally {
			loadingMore = false;
		}
	}
</script>

<svelte:head>
	<title>Liked Videos - Shortless YouTube</title>
</svelte:head>

<div class="mx-auto max-w-screen-xl px-4 py-4">
	<h1 class="mb-4 text-xl font-bold">Liked Videos</h1>

	{#await data.streamed.likedData}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _unused, i (i)}
				<Skeleton variant="video-card" />
			{/each}
		</div>
	{:then _likedData}
		{#if allVideos.length > 0}
			<VirtualFeed
				items={allVideos}
				columns={cols.value}
				gap={16}
				hasMore={!!nextPageToken}
				{loadingMore}
				onLoadMore={loadMore}
			>
				{#snippet children(video)}
					<VideoCard {video} />
				{/snippet}
			</VirtualFeed>
		{:else if !nextPageToken}
			<p class="text-yt-text-secondary py-8 text-center">No liked videos found.</p>
		{/if}
	{:catch}
		<p class="text-yt-text-secondary py-8 text-center">Failed to load liked videos.</p>
	{/await}
</div>
