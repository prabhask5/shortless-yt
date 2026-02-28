<!--
	@component Playlist Page

	Displays a playlist's metadata (thumbnail, title, channel, video count,
	description) alongside a numbered list of its videos with infinite scroll.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import type { VideoItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Maximum client-side pagination retries when all results are filtered out */
	const MAX_CLIENT_PAGES = 6;

	let allVideos = $state<VideoItem[]>([]);
	let nextPageToken = $state<string | undefined>(undefined);
	let loadingMore = $state(false);

	$effect(() => {
		allVideos = data.videos;
		nextPageToken = data.nextPageToken;
	});

	/* Map videos to numbered entries for the track-number display column */
	let numberedVideos = $derived(allVideos.map((video, i) => ({ video, number: i + 1 })));

	async function loadMore() {
		if (!nextPageToken || loadingMore) return;
		loadingMore = true;
		try {
			let token: string | undefined = nextPageToken;
			for (let page = 0; page < MAX_CLIENT_PAGES && token; page++) {
				const params = new URLSearchParams({
					source: 'playlist',
					pageToken: token,
					playlistId: data.playlist.id
				});
				const res: Response = await fetch(`/api/videos?${params}`);
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
	<title>{data.playlist.title} - Shortless YouTube</title>
</svelte:head>

<div class="mx-auto max-w-screen-xl px-4 py-4">
	<div class="mb-6">
		<div class="flex items-start gap-4">
			<img
				src={data.playlist.thumbnailUrl}
				alt={data.playlist.title}
				class="w-40 rounded-lg sm:w-60"
			/>
			<div>
				<h1 class="text-xl font-bold sm:text-2xl">{data.playlist.title}</h1>
				<p class="text-yt-text-secondary text-sm">{data.playlist.channelTitle}</p>
				<p class="text-yt-text-secondary text-sm">{data.playlist.itemCount} videos</p>
				{#if data.playlist.description}
					<p class="text-yt-text-secondary mt-2 line-clamp-3 text-sm">
						{data.playlist.description}
					</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Single-column VirtualFeed with numbered entries resembling YouTube's playlist view -->
	<VirtualFeed
		items={numberedVideos}
		columns={1}
		gap={12}
		hasMore={!!nextPageToken}
		{loadingMore}
		onLoadMore={loadMore}
	>
		{#snippet children(entry)}
			<div class="flex items-center gap-3">
				<!-- Track number column -->
				<span class="text-yt-text-secondary w-8 text-center text-sm">{entry.number}</span>
				<div class="flex-1">
					<VideoCard video={entry.video} layout="horizontal" />
				</div>
			</div>
		{/snippet}
	</VirtualFeed>
</div>
