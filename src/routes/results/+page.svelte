<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { addSearch } from '$lib/stores/search-history';
	import type { VideoItem, SearchResponse } from '$lib/types';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	let query = $derived($page.url.searchParams.get('q') || '');
	let videos = $state<VideoItem[]>([]);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state('');
	let nextPageToken = $state<string | undefined>();
	let filteredCount = $state(0);
	let reachedEnd = $state(false);
	let abortController: AbortController | null = null;
	let sentinelEl: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver | null = null;

	async function search(pageToken?: string) {
		if (!query) return;

		if (!pageToken) {
			loading = true;
			videos = [];
			reachedEnd = false;
		} else {
			loadingMore = true;
		}
		error = '';

		// Abort previous request
		if (abortController) abortController.abort();
		abortController = new AbortController();

		try {
			const params = new URLSearchParams({ q: query });
			if (pageToken) params.set('pageToken', pageToken);

			const res = await fetch(`/api/search?${params}`, { signal: abortController.signal });
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Search failed');
			}

			const data: SearchResponse = await res.json();

			if (pageToken) {
				videos = [...videos, ...data.items];
			} else {
				videos = data.items;
				addSearch(query);
			}

			nextPageToken = data.nextPageToken;
			filteredCount += data.filteredCount;

			if (!data.nextPageToken) {
				reachedEnd = true;
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
				if (entries[0]?.isIntersecting && !loadingMore && nextPageToken) {
					search(nextPageToken);
				}
			},
			{ rootMargin: '800px' }
		);
		if (sentinelEl) observer.observe(sentinelEl);
	}

	// Watch for query changes
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
</script>

<svelte:head>
	<title>{query ? `${query} - Shortless` : 'Search - Shortless'}</title>
</svelte:head>

<div class="results-page">
	{#if error}
		<ErrorBanner message={error} onDismiss={() => (error = '')} />
	{/if}

	{#if query}
		<div class="results-header">
			{#if !loading && videos.length > 0}
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

	<VideoGrid {videos} loading={loading || loadingMore} layout="list" />
	<div bind:this={sentinelEl} class="scroll-sentinel" aria-hidden="true"></div>

	{#if !loading && !loadingMore && videos.length === 0 && query && !error}
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

	{#if reachedEnd && videos.length > 0 && !loading}
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
</style>
