<!--
	@component Subscription Feed Page

	Chronological k-way merge of recent uploads from all subscribed channels,
	with an infinite scroll feed and subscription channel bar.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import ChannelBar from '$lib/components/ChannelBar.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import SlowLoadNotice from '$lib/components/SlowLoadNotice.svelte';
	import { useColumns } from '$lib/stores/columns.svelte';
	import type { VideoItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cols = useColumns();

	const MAX_CLIENT_PAGES = 6;

	let feed = $state<VideoItem[]>([]);
	let subFeedCursor = $state<unknown>(undefined);
	let loading = $state(false);
	let initialLoading = $state(true);

	let generation = 0;

	$effect(() => {
		initialLoading = true;
		const gen = ++generation;
		data.streamed.subData.then((subData) => {
			if (gen !== generation) return;
			feed = subData.feed ?? [];
			subFeedCursor = subData.cursor;
			initialLoading = false;
		});
	});

	async function loadMore() {
		if (!subFeedCursor || loading) return;
		loading = true;
		try {
			let cursor: unknown = subFeedCursor;
			for (let page = 0; page < MAX_CLIENT_PAGES && cursor; page++) {
				const res: Response = await fetch(
					`/api/videos?source=subfeed&cursor=${encodeURIComponent(JSON.stringify(cursor))}`
				);
				if (!res.ok) break;
				const json: { items: VideoItem[]; cursor?: unknown } = await res.json();
				if (json.items.length > 0) {
					feed.push(...json.items);
				}
				cursor = json.cursor;
				if (json.items.length > 0) break;
			}
			subFeedCursor = cursor;
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Subscriptions - Shortless</title>
</svelte:head>

<div class="mx-auto max-w-screen-2xl px-4 py-4">
	<h1 class="mb-4 text-xl font-bold">Subscriptions</h1>
	{#await data.streamed.subData}
		<section class="mb-6">
			<div class="flex gap-4 overflow-hidden">
				{#each Array(8) as _unused, i (i)}
					<div class="flex shrink-0 flex-col items-center gap-2">
						<div class="bg-yt-surface h-14 w-14 animate-pulse rounded-full"></div>
						<div class="bg-yt-surface h-3 w-12 animate-pulse rounded"></div>
					</div>
				{/each}
			</div>
		</section>
		<section>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{#each Array(12) as _unused, i (i)}
					<Skeleton variant="video-card" />
				{/each}
			</div>
		</section>
	{:then subData}
		{#if subData.subscriptions && subData.subscriptions.length > 0}
			<section class="mb-6">
				<ChannelBar
					channels={subData.subscriptions.map((s) => ({
						id: s.id,
						title: s.title,
						thumbnailUrl: s.thumbnailUrl
					}))}
				/>
			</section>
		{/if}
		<section>
			{#if feed.length > 0}
				<VirtualFeed
					items={feed}
					columns={cols.value}
					gap={16}
					hasMore={!!subFeedCursor}
					loadingMore={loading}
					onLoadMore={loadMore}
				>
					{#snippet children(video)}
						<VideoCard {video} />
					{/snippet}
				</VirtualFeed>
			{:else if !subFeedCursor}
				<p class="text-yt-text-secondary py-8 text-center">
					No recent videos from your subscriptions.
				</p>
			{/if}
		</section>
	{:catch}
		<p class="text-yt-text-secondary py-8 text-center">Failed to load feed.</p>
	{/await}
</div>

<SlowLoadNotice visible={initialLoading || loading} />
