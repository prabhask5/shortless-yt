<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { searchHistory, clearHistory } from '$lib/stores/search-history';
	import { page } from '$app/stores';
	import type { VideoItem, SearchResponse } from '$lib/types';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	let authError = $derived($page.url.searchParams.get('auth_error'));

	let videos = $state<VideoItem[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state('');
	let nextPageToken = $state<string | undefined>();
	let nextOffset = $state(0);
	let reachedEnd = $state(false);
	let abortController: AbortController | null = null;

	async function loadRecommended(pageToken?: string) {
		if (!pageToken) {
			loading = true;
			videos = [];
			reachedEnd = false;
			nextOffset = 0;
		} else {
			loadingMore = true;
		}
		error = '';

		if (abortController) abortController.abort();
		abortController = new AbortController();

		try {
			const params = new URLSearchParams();
			if (pageToken) params.set('pageToken', pageToken);
			if (nextOffset > 0) params.set('offset', String(nextOffset));

			const res = await fetch(`/api/recommended?${params}`, {
				signal: abortController.signal
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to load recommendations');
			}

			const data: SearchResponse = await res.json();

			if (pageToken) {
				videos = [...videos, ...data.items];
			} else {
				videos = data.items;
			}

			nextPageToken = data.nextPageToken;
			if (data.nextPageToken) {
				nextOffset += 4;
			}

			if (!data.nextPageToken) {
				reachedEnd = true;
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loading = false;
			loadingMore = false;
			scheduleScrollCheck();
		}
	}

	function scheduleScrollCheck() {
		if (!browser) return;
		requestAnimationFrame(() => handleScroll());
	}

	function handleScroll() {
		if (!browser || loadingMore || !nextPageToken) return;
		const scrollY = window.scrollY;
		const windowHeight = window.innerHeight;
		const docHeight = document.documentElement.scrollHeight;

		if (docHeight - scrollY - windowHeight < 800) {
			loadRecommended(nextPageToken);
		}
	}

	function handleSearchClick(query: string) {
		goto(`/results?q=${encodeURIComponent(query)}`);
	}

	beforeNavigate(() => {
		if (abortController) abortController.abort();
		loading = false;
		loadingMore = false;
	});

	onMount(() => {
		loadRecommended();

		if (browser) {
			window.addEventListener('scroll', handleScroll, { passive: true });
			return () => {
				window.removeEventListener('scroll', handleScroll);
				if (abortController) abortController.abort();
			};
		}
	});
</script>

<svelte:head>
	<title>Shortless - YouTube without Shorts</title>
</svelte:head>

<div class="home-page">
	{#if authError}
		<div class="auth-error">
			<p>Sign-in failed: {authError}</p>
			<a href="/" class="btn btn-secondary">Dismiss</a>
		</div>
	{/if}

	{#if error}
		<ErrorBanner message={error} onDismiss={() => (error = '')} />
	{/if}

	{#if $searchHistory.length > 0}
		<div class="recent-section">
			<div class="recent-header">
				<h2 class="recent-title">Recent searches</h2>
				<button class="clear-btn" onclick={clearHistory}>Clear all</button>
			</div>
			<div class="recent-chips">
				{#each $searchHistory.slice(0, 10) as item (item)}
					<button class="chip" onclick={() => handleSearchClick(item)}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
							/>
						</svg>
						{item}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<VideoGrid {videos} loading={loading || loadingMore} layout="grid" />

	{#if !loading && !loadingMore && videos.length === 0 && !error}
		<div class="empty-state">
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
				<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
				<polygon points="10,8 16,12 10,16" />
			</svg>
			<p>No videos available right now</p>
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
	.home-page {
		max-width: var(--content-max-width);
		margin: 0 auto;
		padding: 16px 0;
	}

	.auth-error {
		background: rgba(204, 0, 0, 0.1);
		border: 1px solid var(--red-text);
		border-radius: 8px;
		padding: 12px 16px;
		margin-bottom: 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		color: var(--red-text);
		font-size: 14px;
	}

	.recent-section {
		margin-bottom: 24px;
	}

	.recent-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.recent-title {
		font-size: 16px;
		font-weight: 600;
	}

	.clear-btn {
		font-size: 13px;
		color: var(--text-link);
		padding: 4px 8px;
	}

	.clear-btn:hover {
		text-decoration: underline;
	}

	.recent-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: var(--bg-chip);
		border-radius: 18px;
		font-size: 14px;
		color: var(--text-primary);
		min-height: 44px;
		transition: background-color 0.15s;
	}

	.chip:hover {
		background: var(--bg-tertiary);
	}

	.empty-state {
		text-align: center;
		padding: 48px 0;
		color: var(--text-secondary);
		font-size: 16px;
	}

	.empty-state svg {
		margin-bottom: 16px;
		opacity: 0.4;
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
		.home-page {
			padding: 8px 0;
		}
	}
</style>
