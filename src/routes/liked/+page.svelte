<!--
	@component Liked Videos Page

	Displays the authenticated user's liked videos with streaming skeletons
	and infinite scroll pagination.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import SlowLoadNotice from '$lib/components/SlowLoadNotice.svelte';
	import { useColumns } from '$lib/stores/columns.svelte';
	import type { VideoItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cols = useColumns(3);

	/** Maximum client-side pagination retries when all results are filtered out */
	const MAX_CLIENT_PAGES = 6;

	/* ── Infinite scroll state ── */
	let allVideos = $state<VideoItem[]>([]);
	let nextPageToken = $state<string | undefined>(undefined);
	let loadingMore = $state(false);
	let initialLoading = $state(true);

	let generation = 0;

	$effect(() => {
		initialLoading = true;
		const gen = ++generation;
		data.streamed.likedData.then((likedData) => {
			if (gen !== generation) return;
			allVideos = likedData.videos;
			nextPageToken = likedData.nextPageToken;
			initialLoading = false;
		});
	});

	async function loadMore() {
		if (!nextPageToken || loadingMore) return;
		loadingMore = true;
		try {
			let token: string | undefined = nextPageToken;
			for (let page = 0; page < MAX_CLIENT_PAGES && token; page++) {
				const params: Record<string, string> = {
					source: 'liked',
					pageToken: token
				};
				const res: Response = await fetch(`/api/videos?${new URLSearchParams(params)}`);
				if (!res.ok) break;
				const json: { items: VideoItem[]; nextPageToken?: string } = await res.json();
				if (json.items.length > 0) {
					allVideos.push(...json.items);
				}
				token = json.nextPageToken;
				if (json.items.length > 0) break;
			}
			nextPageToken = token;
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

<SlowLoadNotice visible={initialLoading || loadingMore} />
