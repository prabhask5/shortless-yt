<!--
	@component Search Results Page

	Displays search results with multi-select type filter chips (Videos / Channels / Playlists).
	By default all types are selected. Toggling chips filters the results.
	Results from all selected types are rendered together in a unified list,
	each using its appropriate card component.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import ChannelCard from '$lib/components/ChannelCard.svelte';
	import PlaylistCard from '$lib/components/PlaylistCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import FilterChips from '$lib/components/FilterChips.svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { SearchResult } from './+page.server';

	let { data }: { data: PageData } = $props();

	const typeFilters = [
		{ label: 'Videos', value: 'video' },
		{ label: 'Channels', value: 'channel' },
		{ label: 'Playlists', value: 'playlist' }
	];

	function handleTypeChange(types: string | string[]) {
		const typesArray = Array.isArray(types) ? types : [types];
		const q = data.query ? `q=${encodeURIComponent(data.query)}&` : '';
		goto(`/search?${q}types=${encodeURIComponent(typesArray.join(','))}`);
	}
</script>

<svelte:head>
	<title>{data.query ? `${data.query} - Shortless YouTube` : 'Search - Shortless YouTube'}</title>
</svelte:head>

<div class="mx-auto max-w-screen-xl px-4 py-4">
	<FilterChips
		filters={typeFilters}
		selected={data.types}
		onChange={handleTypeChange}
		multiSelect={true}
	/>

	{#if !data.query}
		<p class="text-yt-text-secondary mt-8 text-center">Search for videos, channels, or playlists</p>
	{:else if data.results.length === 0}
		<p class="text-yt-text-secondary mt-8 text-center">No results found for "{data.query}"</p>
	{:else}
		<div class="mt-4">
			<VirtualFeed
				items={data.results as SearchResult[]}
				columns={1}
				estimateRowHeight={100}
				gap={8}
			>
				{#snippet children(result)}
					{#if result.type === 'video'}
						<VideoCard video={result.item} layout="horizontal" />
					{:else if result.type === 'channel'}
						<ChannelCard channel={result.item} />
					{:else if result.type === 'playlist'}
						<PlaylistCard playlist={result.item} />
					{/if}
				{/snippet}
			</VirtualFeed>
		</div>
	{/if}
</div>
