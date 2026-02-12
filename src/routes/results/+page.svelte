<script lang="ts">
	/**
	 * Search Results Page (/results/+page.svelte)
	 *
	 * Displays YouTube search results with Shorts filtered out. Features:
	 * - Filter tabs: All, Videos, Channels, Playlists
	 * - Video-only results use VideoGrid (list layout) with Shorts filtering
	 * - Mixed results (All/Channel/Playlist filters) render VideoCard, ChannelCard,
	 *   and PlaylistCard components in a vertical list
	 * - Infinite scroll pagination via IntersectionObserver
	 * - Shows count of filtered-out Shorts for transparency
	 * - Saves successful searches to search history (localStorage)
	 *
	 * Data flow:
	 *   URL query param ?q=<query> -> $derived(query) -> $effect triggers search()
	 *   search() fetches /api/search?q=<query>&type=<filter>&pageToken=<token>
	 *   Video filter: response -> SearchResponse -> videos[]
	 *   Other filters: response -> EnhancedSearchResponse -> mixedResults[]
	 *   IntersectionObserver on sentinelEl -> triggers search(nextPageToken)
	 *   First successful search for a query -> addSearch(query) saves to history
	 */
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

	/**
	 * $derived rune: Reactively extracts the search query 'q' from URL search params.
	 * Updates when the user submits a new search from the TopBar or navigates via history.
	 */
	let query = $derived($page.url.searchParams.get('q') || '');
	/** $state rune: Video-only search results (used when activeFilter is 'video') */
	let videos = $state<VideoItem[]>([]);
	/** $state rune: Mixed search results containing videos, channels, and playlists (used for non-video filters) */
	let mixedResults = $state<SearchResultItem[]>([]);
	/** $state rune: Whether the initial search request is in progress */
	let loading = $state(false);
	/** $state rune: Whether a pagination (load more) request is in progress */
	let loadingMore = $state(false);
	/** $state rune: Error message from a failed search, empty string means no error */
	let error = $state('');
	/** $state rune: YouTube API pagination token for fetching the next page of results */
	let nextPageToken = $state<string | undefined>();
	/** $state rune: Running total of Shorts that were filtered out across all loaded pages */
	let filteredCount = $state(0);
	/** $state rune: Whether all available search results have been exhausted */
	let reachedEnd = $state(false);
	/** AbortController for cancelling in-flight search requests on new search or navigation */
	let abortController: AbortController | null = null;
	/**
	 * $state rune: Bound reference to the sentinel <div> for infinite scroll.
	 * Placed after the results list; IntersectionObserver watches it to trigger pagination.
	 */
	let sentinelEl: HTMLDivElement | undefined = $state();
	/** IntersectionObserver instance for infinite scroll; cleaned up on unmount */
	let observer: IntersectionObserver | null = null;
	/** Timestamp of the last pagination load, used for 500ms debounce */
	let lastLoadTime = 0;

	/** Union type for the available search filter options */
	type FilterType = 'video' | 'channel' | 'playlist' | 'all';
	/** $state rune: Currently active filter tab, defaults to 'video' for Shorts-free browsing */
	let activeFilter = $state<FilterType>('video');

	/** Static definition of the filter tab options displayed in the UI */
	const filters: { label: string; value: FilterType }[] = [
		{ label: 'All', value: 'all' },
		{ label: 'Videos', value: 'video' },
		{ label: 'Channels', value: 'channel' },
		{ label: 'Playlists', value: 'playlist' }
	];

	/**
	 * Switches the active search filter and re-executes the search.
	 * No-ops if the same filter is already selected.
	 * Resets filteredCount since a new filter means fresh result set.
	 *
	 * @param filter - The filter type to switch to
	 */
	function changeFilter(filter: FilterType) {
		if (activeFilter === filter) return;
		activeFilter = filter;
		filteredCount = 0;
		search();
	}

	/**
	 * Executes a search against /api/search with the current query and filter.
	 * Handles both initial searches (no pageToken) and paginated follow-ups.
	 *
	 * @param pageToken - YouTube API page token for pagination.
	 *                    If omitted, performs a fresh search (resets results).
	 *
	 * When activeFilter is 'video':
	 *   - Uses SearchResponse type (items are VideoItem[])
	 *   - Tracks filteredCount (number of Shorts removed by server)
	 *
	 * When activeFilter is anything else ('all', 'channel', 'playlist'):
	 *   - Uses EnhancedSearchResponse type (items are SearchResultItem[])
	 *   - Each item has a `kind` field to determine which card component to render
	 *
	 * On first successful search (not pagination), saves query to search history.
	 */
	async function search(pageToken?: string) {
		if (!query) return;

		if (!pageToken) {
			// Fresh search: abort any in-flight request, reset all state
			if (abortController) abortController.abort();
			abortController = new AbortController();
			loading = true;
			videos = [];
			mixedResults = [];
			reachedEnd = false;
			nextPageToken = undefined;
		} else {
			// Pagination: enforce 500ms debounce to prevent IntersectionObserver rapid-fire
			const now = Date.now();
			if (now - lastLoadTime < 500) return;
			lastLoadTime = now;
			loadingMore = true;
		}
		error = '';

		try {
			const params = new URLSearchParams({ q: query });
			if (pageToken) params.set('pageToken', pageToken);

			// Map the filter selection to the YouTube API 'type' parameter
			if (activeFilter === 'video') {
				params.set('type', 'video');
			} else if (activeFilter === 'all') {
				params.set('type', 'video,channel,playlist');
			} else {
				params.set('type', activeFilter);
			}

			const res = await fetch(`/api/search?${params}`, { signal: abortController?.signal });
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Search failed');
			}

			if (activeFilter === 'video') {
				// Video-only mode: parse as SearchResponse, use videos[] array
				const data: SearchResponse = await res.json();
				if (pageToken) {
					// Pagination: append via .push() for efficient Svelte 5 reactivity
					videos.push(...data.items);
				} else {
					videos = data.items;
					// Save to search history on the first page of a new search
					addSearch(query);
				}
				nextPageToken = data.nextPageToken;
				// Accumulate filtered Shorts count across pages for display
				filteredCount += data.filteredCount;
				if (!data.nextPageToken) reachedEnd = true;
			} else {
				// Mixed mode: parse as EnhancedSearchResponse, use mixedResults[] array
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
			// Silently ignore AbortError (intentional cancellation)
			if (err instanceof DOMException && err.name === 'AbortError') return;
			error = err instanceof Error ? err.message : 'Search failed';
			nextPageToken = undefined;
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	/**
	 * Creates an IntersectionObserver on the sentinel element for infinite scroll.
	 * Uses 400px rootMargin to start loading before the user reaches the bottom.
	 * Multiple guards prevent duplicate/unnecessary requests.
	 */
	function setupObserver() {
		if (!browser || observer) return;
		observer = new IntersectionObserver(
			(entries) => {
				if (
					entries[0]?.isIntersecting &&
					!loadingMore &&
					!loading &&
					!reachedEnd &&
					nextPageToken
				) {
					search(nextPageToken);
				}
			},
			{ rootMargin: '400px' }
		);
		if (sentinelEl) observer.observe(sentinelEl);
	}

	/**
	 * $effect rune: Watches the derived query value. When the search query changes
	 * (e.g., user submits a new search from TopBar), resets the filtered count and
	 * triggers a fresh search.
	 */
	$effect(() => {
		if (query) {
			filteredCount = 0;
			search();
		}
	});

	/**
	 * Lifecycle: Abort in-flight requests when navigating away from the results page.
	 * Resets loading states to prevent stale UI.
	 */
	beforeNavigate(() => {
		if (abortController) abortController.abort();
		loading = false;
		loadingMore = false;
	});

	/**
	 * $effect rune: Attaches the IntersectionObserver once the sentinel element is bound.
	 * Returns a cleanup function to disconnect the observer on unmount.
	 */
	$effect(() => {
		if (sentinelEl && browser) {
			setupObserver();
			return () => {
				observer?.disconnect();
				observer = null;
			};
		}
	});

	/**
	 * Lifecycle: Cleanup on unmount — aborts any in-flight fetch requests.
	 */
	onMount(() => {
		return () => {
			if (abortController) abortController.abort();
		};
	});

	/**
	 * $derived rune: Computed boolean that checks whether there are any results to display.
	 * Switches between videos[] and mixedResults[] based on the active filter.
	 * Used in the template to show/hide the "no results" empty state.
	 */
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
