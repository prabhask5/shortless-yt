<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { addSearch } from '$lib/stores/search-history';
	import type {
		VideoItem,
		SearchResponse,
		SearchResultItem,
		EnhancedSearchResponse
	} from '$lib/types';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import VideoCard from '$lib/components/VideoCard.svelte';
	import ChannelCard from '$lib/components/ChannelCard.svelte';
	import PlaylistCard from '$lib/components/PlaylistCard.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	let query = $derived($page.url.searchParams.get('q') || '');
	let videos = $state<VideoItem[]>([]);
	let mixedResults = $state<SearchResultItem[]>([]);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state('');
	let nextPageToken = $state<string | undefined>();
	let filteredCount = $state(0);
	let reachedEnd = $state(false);
	let abortController: AbortController | null = null;
	let sentinelEl: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver | null = null;
	let lastLoadTime = 0;

	type FilterType = 'video' | 'channel' | 'playlist' | 'all';
	let activeFilter = $state<FilterType>('video');

	const filters: { label: string; value: FilterType }[] = [
		{ label: 'All', value: 'all' },
		{ label: 'Videos', value: 'video' },
		{ label: 'Channels', value: 'channel' },
		{ label: 'Playlists', value: 'playlist' }
	];

	function changeFilter(filter: FilterType) {
		if (activeFilter === filter) return;
		activeFilter = filter;
		filteredCount = 0;
		search();
	}

	async function search(pageToken?: string) {
		if (!query) return;

		if (!pageToken) {
			loading = true;
			videos = [];
			mixedResults = [];
			reachedEnd = false;
		} else {
			const now = Date.now();
			if (now - lastLoadTime < 500) return;
			lastLoadTime = now;
			loadingMore = true;
		}
		error = '';

		if (abortController) abortController.abort();
		abortController = new AbortController();

		try {
			const params = new URLSearchParams({ q: query });
			if (pageToken) params.set('pageToken', pageToken);

			if (activeFilter === 'video') {
				params.set('type', 'video');
			} else if (activeFilter === 'all') {
				params.set('type', 'video,channel,playlist');
			} else {
				params.set('type', activeFilter);
			}

			const res = await fetch(`/api/search?${params}`, { signal: abortController.signal });
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Search failed');
			}

			if (activeFilter === 'video') {
				const data: SearchResponse = await res.json();
				if (pageToken) {
					videos.push(...data.items);
				} else {
					videos = data.items;
					addSearch(query);
				}
				nextPageToken = data.nextPageToken;
				filteredCount += data.filteredCount;
				if (!data.nextPageToken) reachedEnd = true;
			} else {
				const data: EnhancedSearchResponse = await res.json();
				if (pageToken) {
					mixedResults.push(...data.items);
				} else {
					mixedResults = data.items;
					addSearch(query);
				}
				nextPageToken = data.nextPageToken;
				if (!data.nextPageToken) reachedEnd = true;
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			error = err instanceof Error ? err.message : 'Search failed';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	function setupObserver() {
		if (!browser || observer) return;
		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !loadingMore && !loading && nextPageToken) {
					search(nextPageToken);
				}
			},
			{ rootMargin: '400px' }
		);
		if (sentinelEl) observer.observe(sentinelEl);
	}

	$effect(() => {
		if (query) {
			filteredCount = 0;
			search();
		}
	});

	beforeNavigate(() => {
		if (abortController) abortController.abort();
		loading = false;
		loadingMore = false;
	});

	$effect(() => {
		if (sentinelEl && browser) {
			setupObserver();
			return () => {
				observer?.disconnect();
				observer = null;
			};
		}
	});

	onMount(() => {
		return () => {
			if (abortController) abortController.abort();
		};
	});

	let hasResults = $derived(activeFilter === 'video' ? videos.length > 0 : mixedResults.length > 0);
</script>

<svelte:head>
	<title>{query ? `${query} - Shortless Youtube` : 'Search - Shortless Youtube'}</title>
</svelte:head>

<div class="results-page">
	{#if error}
		<ErrorBanner message={error} onDismiss={() => (error = '')} />
	{/if}

	{#if query}
		<div class="filter-tabs" role="tablist">
			{#each filters as filter (filter.value)}
				<button
					class="filter-tab"
					class:active={activeFilter === filter.value}
					role="tab"
					aria-selected={activeFilter === filter.value}
					onclick={() => changeFilter(filter.value)}>{filter.label}</button
				>
			{/each}
		</div>

		<div class="results-header">
			{#if !loading && hasResults}
				<p class="filter-info">
					{filteredCount > 0 ? `${filteredCount} Shorts filtered out` : ''}
				</p>
			{/if}
		</div>
	{:else}
		<div class="no-query">
			<p>Enter a search query to find videos</p>
		</div>
	{/if}

	{#if activeFilter === 'video'}
		<VideoGrid {videos} loading={loading || loadingMore} layout="list" />
	{:else}
		<div class="mixed-results">
			{#each mixedResults as result (result.kind === 'video' ? result.video?.id : result.kind === 'channel' ? result.channel?.id : result.playlist?.id)}
				{#if result.kind === 'video' && result.video}
					<VideoCard video={result.video} layout="list" />
				{:else if result.kind === 'channel' && result.channel}
					<ChannelCard channel={result.channel} />
				{:else if result.kind === 'playlist' && result.playlist}
					<PlaylistCard playlist={result.playlist} />
				{/if}
			{/each}
			{#if loading || loadingMore}
				<div class="loading-indicator">
					<div class="spinner"></div>
				</div>
			{/if}
		</div>
	{/if}

	<div bind:this={sentinelEl} class="scroll-sentinel" aria-hidden="true"></div>

	{#if !loading && !loadingMore && !hasResults && query && !error}
		<div class="no-results">
			<svg
				width="80"
				height="80"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="11" cy="11" r="8" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
				<line x1="8" y1="11" x2="14" y2="11" />
			</svg>
			<p>No results found for "{query}"</p>
		</div>
	{/if}

	{#if reachedEnd && hasResults && !loading}
		<div class="end-of-results">
			<div class="end-line"></div>
			<span class="end-text">You've reached the end</span>
			<div class="end-line"></div>
		</div>
	{/if}
</div>

<style>
	.results-page {
		max-width: 900px;
		margin: 0 auto;
	}

	.filter-tabs {
		display: flex;
		gap: 8px;
		margin-bottom: 16px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: x mandatory;
	}

	.filter-tab {
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		background: var(--bg-secondary);
		color: var(--text-secondary);
		cursor: pointer;
		white-space: nowrap;
		scroll-snap-align: start;
		min-height: 44px;
		min-width: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.filter-tab.active {
		background: var(--text-primary);
		color: var(--bg-primary);
	}

	.results-header {
		margin-bottom: 16px;
	}

	.filter-info {
		font-size: 13px;
		color: var(--text-secondary);
	}

	.no-query,
	.no-results {
		text-align: center;
		padding: 48px 0;
		color: var(--text-secondary);
		font-size: 16px;
	}

	.no-results svg {
		margin-bottom: 16px;
		opacity: 0.4;
	}

	.mixed-results {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.loading-indicator {
		display: flex;
		justify-content: center;
		padding: 24px 0;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border-color, #333);
		border-top-color: var(--text-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.scroll-sentinel {
		height: 1px;
	}

	.end-of-results {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 32px 0 16px;
		color: var(--text-secondary);
		font-size: 13px;
	}

	.end-line {
		flex: 1;
		height: 1px;
		background: var(--border-color, #e0e0e0);
	}

	.end-text {
		white-space: nowrap;
	}

	@media (max-width: 768px) {
		.filter-tabs {
			position: sticky;
			top: var(--topbar-height, 56px);
			z-index: 10;
			background: var(--bg-primary);
			padding: 8px 0;
			margin: 0 -16px 16px;
			padding: 8px 16px;
		}
	}
</style>
