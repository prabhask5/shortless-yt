<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import ChannelCard from '$lib/components/ChannelCard.svelte';
	import PlaylistCard from '$lib/components/PlaylistCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import FilterChips from '$lib/components/FilterChips.svelte';
	import { goto } from '$app/navigation';
	import type { VideoItem, ChannelItem, PlaylistItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const typeFilters = [
		{ label: 'Videos', value: 'video' },
		{ label: 'Channels', value: 'channel' },
		{ label: 'Playlists', value: 'playlist' }
	];

	function handleTypeChange(type: string) {
		const q = data.query ? `q=${encodeURIComponent(data.query)}&` : '';
		goto(`/search?${q}type=${encodeURIComponent(type)}`);
	}
</script>

<svelte:head>
	<title>{data.query ? `${data.query} - Shortless YouTube` : 'Search - Shortless YouTube'}</title>
</svelte:head>

<div class="mx-auto max-w-screen-xl px-4 py-4">
	<FilterChips filters={typeFilters} selected={data.type} onChange={handleTypeChange} />

	{#if !data.query}
		<p class="text-yt-text-secondary mt-8 text-center">Search for videos, channels, or playlists</p>
	{:else if data.results.length === 0}
		<p class="text-yt-text-secondary mt-8 text-center">No results found for "{data.query}"</p>
	{:else}
		<div class="mt-4">
			{#if data.type === 'channel'}
				<VirtualFeed
					items={data.results as ChannelItem[]}
					columns={1}
					estimateRowHeight={80}
					gap={16}
				>
					{#snippet children(item)}
						<ChannelCard channel={item} />
					{/snippet}
				</VirtualFeed>
			{:else if data.type === 'playlist'}
				<VirtualFeed
					items={data.results as PlaylistItem[]}
					columns={1}
					estimateRowHeight={120}
					gap={16}
				>
					{#snippet children(item)}
						<PlaylistCard playlist={item} />
					{/snippet}
				</VirtualFeed>
			{:else}
				<VirtualFeed
					items={data.results as VideoItem[]}
					columns={1}
					estimateRowHeight={120}
					gap={16}
				>
					{#snippet children(item)}
						<VideoCard video={item} layout="horizontal" />
					{/snippet}
				</VirtualFeed>
			{/if}
		</div>

		{#if data.nextPageToken}
			<div class="mt-6 flex justify-center">
				<a
					href="/search?q={data.query}&type={data.type}&pageToken={data.nextPageToken}"
					class="bg-yt-surface hover:bg-yt-surface-hover rounded-full px-6 py-2 text-sm"
				>
					Load more
				</a>
			</div>
		{/if}
	{/if}
</div>
