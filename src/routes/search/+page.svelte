<!--
	@component Search Results Page

	Displays search results with multi-select type filter chips (Videos / Channels / Playlists).
	Uses streaming so the page renders instantly with skeletons while results load.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import ChannelCard from '$lib/components/ChannelCard.svelte';
	import PlaylistCard from '$lib/components/PlaylistCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import FilterChips from '$lib/components/FilterChips.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { PageData } from './$types';
	import type { SearchResult } from './+page.server';

	let { data }: { data: PageData } = $props();

	const typeFilters = [
		{ label: 'Videos', value: 'video' },
		{ label: 'Channels', value: 'channel' },
		{ label: 'Playlists', value: 'playlist' }
	];

	let selectedTypes = $state<string[]>(['video', 'channel', 'playlist']);

	/** Resolved results from streaming */
	let resolvedResults = $state<SearchResult[]>([]);
	let isLoading = $state(true);

	$effect(() => {
		if (data.streamed?.searchData) {
			isLoading = true;
			data.streamed.searchData.then((searchData) => {
				resolvedResults = searchData.results as SearchResult[];
				isLoading = false;
			});
		} else if ('results' in data) {
			resolvedResults = data.results as SearchResult[];
			isLoading = false;
		}
	});

	let filteredResults = $derived(resolvedResults.filter((r) => selectedTypes.includes(r.type)));

	function handleTypeChange(types: string | string[]) {
		selectedTypes = Array.isArray(types) ? types : [types];
	}
</script>

<svelte:head>
	<title>{data.query ? `${data.query} - Shortless YouTube` : 'Search - Shortless YouTube'}</title>
</svelte:head>

<div class="mx-auto max-w-screen-xl px-4 py-4">
	<FilterChips
		filters={typeFilters}
		selected={selectedTypes}
		onChange={handleTypeChange}
		multiSelect={true}
	/>

	{#if !data.query}
		<p class="text-yt-text-secondary mt-8 text-center">Search for videos, channels, or playlists</p>
	{:else if isLoading}
		<!-- Search result skeletons -->
		<div class="mt-4 space-y-3">
			{#each Array(8) as _unused, i (i)}
				{#if i % 3 === 1}
					<Skeleton variant="channel-card" />
				{:else}
					<div class="flex gap-3 p-2">
						<div class="bg-yt-surface h-20 w-36 shrink-0 animate-pulse rounded-lg"></div>
						<div class="flex-1 space-y-2">
							<div class="bg-yt-surface h-4 w-3/4 animate-pulse rounded"></div>
							<div class="bg-yt-surface h-3 w-32 animate-pulse rounded"></div>
							<div class="bg-yt-surface h-3 w-20 animate-pulse rounded"></div>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{:else if filteredResults.length === 0}
		<p class="text-yt-text-secondary mt-8 text-center">No results found for "{data.query}"</p>
	{:else}
		<div class="mt-4">
			<VirtualFeed items={filteredResults} columns={1} estimateRowHeight={100} gap={8}>
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
