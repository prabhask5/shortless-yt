<script lang="ts">
	/**
	 * Home Page (+page.svelte)
	 *
	 * The main landing page of Shortless. Displays:
	 * - Recent search history chips (from localStorage via searchHistory store)
	 * - A grid of recommended/trending videos fetched from /api/recommended
	 * - Infinite scroll pagination to load more videos as the user scrolls down
	 * - Auth error banner if Google sign-in redirect returned an error
	 * - An empty state message when no videos are available
	 * - Footer links to About, Privacy Policy, and Terms of Service
	 *
	 * Data flow:
	 *   onMount -> loadRecommended() fetches first page from /api/recommended
	 *   IntersectionObserver on sentinelEl -> triggers loadRecommended(nextPageToken) for pagination
	 *   Auth state change ($effect) -> reloads recommendations (signed-in users get personalized feed)
	 *   Pagination uses .push() for efficient Svelte 5 proxy mutation detection
	 */
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { searchHistory, clearHistory } from '$lib/stores/search-history';
	import { authState, authLoading } from '$lib/stores/auth';
	import { page } from '$app/stores';
	import type { VideoItem, SearchResponse } from '$lib/types';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	/**
	 * $derived rune: Reactively extracts the 'auth_error' query parameter from the current URL.
	 * This is set when the Google OAuth redirect fails (e.g., user denied permission).
	 */
	let authError = $derived($page.url.searchParams.get('auth_error'));

	/** $state rune: The list of recommended video items currently loaded and displayed */
	let videos = $state<VideoItem[]>([]);
	/** $state rune: Whether the initial page load is in progress (shows skeleton loaders) */
	let loading = $state(true);
	/** $state rune: Whether a subsequent pagination request is in progress */
	let loadingMore = $state(false);
	/** $state rune: Error message to display in the ErrorBanner, empty string means no error */
	let error = $state('');
	/** $state rune: YouTube API pagination token for the next page of results */
	let nextPageToken = $state<string | undefined>();
	/**
	 * $state rune: Offset counter for server-side subscription channel rotation.
	 * Incremented by 4 per page so the server picks different subscription channels each time.
	 */
	let nextOffset = $state(0);
	/** $state rune: Whether all available results have been exhausted (no more pages) */
	let reachedEnd = $state(false);
	/** AbortController for cancelling in-flight fetch requests on navigation or fresh reload */
	let abortController: AbortController | null = null;
	/** Tracks the previous auth sign-in state to detect sign-in/sign-out transitions */
	let lastAuthSignedIn: boolean | null = null;
	/**
	 * $state rune: Bound reference to the invisible sentinel <div> at the bottom of the video grid.
	 * The IntersectionObserver watches this element to trigger infinite scroll pagination.
	 */
	let sentinelEl: HTMLDivElement | undefined = $state();
	/** IntersectionObserver instance for infinite scroll; cleaned up on unmount */
	let observer: IntersectionObserver | null = null;
	/** Timestamp of the last pagination load, used for 500ms debounce */
	let lastLoadTime = 0;

	/**
	 * Fetches recommended videos from the /api/recommended endpoint.
	 * Handles both initial loads (no pageToken) and paginated loads.
	 *
	 * @param pageToken - YouTube API page token for fetching the next page.
	 *                    If omitted, performs a fresh load (resets all state).
	 *
	 * Fresh load behavior:
	 *   - Aborts any in-flight request to avoid stale data
	 *   - Resets videos array, pagination state, and offset
	 *
	 * Pagination behavior:
	 *   - Enforces 500ms debounce to prevent IntersectionObserver rapid-fire
	 *   - Appends new items via .push() (Svelte 5 proxy detects mutations efficiently)
	 *   - Increments offset by 4 for server-side subscription channel rotation
	 */
	async function loadRecommended(pageToken?: string) {
		if (!pageToken) {
			// Only abort on fresh loads, not pagination — prevents race condition
			// where aborting a pagination request resets state and triggers observer loop
			if (abortController) abortController.abort();
			abortController = new AbortController();
			loading = true;
			videos = [];
			reachedEnd = false;
			nextOffset = 0;
			nextPageToken = undefined;
		} else {
			// Debounce: prevent rapid-fire pagination from IntersectionObserver.
			// The observer can fire multiple times in quick succession as content reflows.
			const now = Date.now();
			if (now - lastLoadTime < 500) return;
			lastLoadTime = now;
			loadingMore = true;
		}
		error = '';

		try {
			const params = new URLSearchParams();
			if (pageToken) params.set('pageToken', pageToken);
			// Offset tells the server which subset of subscription channels to query for variety
			if (nextOffset > 0) params.set('offset', String(nextOffset));

			const res = await fetch(`/api/recommended?${params}`, {
				signal: abortController?.signal
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to load recommendations');
			}

			const data: SearchResponse = await res.json();

			if (pageToken) {
				// Pagination: append to existing array using .push() for efficient Svelte 5 reactivity
				videos.push(...data.items);
			} else {
				// Fresh load: replace the entire array
				videos = data.items;
			}

			nextPageToken = data.nextPageToken;
			if (data.nextPageToken) {
				// Advance offset so the next page queries different subscription channels
				nextOffset += 4;
			}

			if (!data.nextPageToken) {
				// No more pages available from the API
				reachedEnd = true;
			}
		} catch (err) {
			// Silently ignore AbortError (happens on intentional navigation/reload cancellation)
			if (err instanceof DOMException && err.name === 'AbortError') return;
			error = err instanceof Error ? err.message : 'Failed to load';
			nextPageToken = undefined;
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	/**
	 * Creates an IntersectionObserver that watches the sentinel element at the bottom
	 * of the video grid. When the sentinel enters the viewport (with 400px rootMargin
	 * for preloading), it triggers the next page load.
	 *
	 * Guards prevent duplicate triggers:
	 *   - !loadingMore: not already fetching the next page
	 *   - !loading: not performing an initial load
	 *   - !reachedEnd: more pages are available
	 *   - nextPageToken: a valid token exists for the next request
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
					loadRecommended(nextPageToken);
				}
			},
			{ rootMargin: '400px' }
		);
		if (sentinelEl) observer.observe(sentinelEl);
	}

	/**
	 * Navigates to the search results page when a recent search chip is clicked.
	 * @param query - The search query string to use
	 */
	function handleSearchClick(query: string) {
		goto(`/results?q=${encodeURIComponent(query)}`);
	}

	/**
	 * $effect rune: Watches auth state changes (sign-in / sign-out transitions).
	 * When the user's signed-in status changes (and auth is no longer loading),
	 * reloads recommendations so the feed switches between personalized and trending.
	 * Uses lastAuthSignedIn to avoid triggering on the initial load.
	 */
	$effect(() => {
		const isSignedIn = $authState.isSignedIn;
		const isLoading = $authLoading;
		if (isLoading) return;

		if (lastAuthSignedIn !== null && lastAuthSignedIn !== isSignedIn) {
			loadRecommended();
		}
		lastAuthSignedIn = isSignedIn;
	});

	/**
	 * Lifecycle: Abort any in-flight requests when navigating away from the home page.
	 * Resets loading states to prevent stale UI if the user returns.
	 */
	beforeNavigate(() => {
		if (abortController) abortController.abort();
		loading = false;
		loadingMore = false;
	});

	/**
	 * $effect rune: Sets up the IntersectionObserver when the sentinel element is bound.
	 * The sentinel <div> is placed after the VideoGrid in the template. Once bound via
	 * bind:this, this effect attaches the observer. The returned cleanup function disconnects
	 * the observer when the component unmounts or the sentinel is removed.
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
	 * Lifecycle: Triggers the initial data load on mount.
	 * Returns a cleanup function that aborts any in-flight requests on unmount.
	 */
	onMount(() => {
		loadRecommended();
		return () => {
			if (abortController) abortController.abort();
		};
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
	<div bind:this={sentinelEl} class="scroll-sentinel" aria-hidden="true"></div>

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

	<footer class="home-footer">
		<a href="/about">About</a>
		<span class="footer-dot">&middot;</span>
		<a href="/privacy">Privacy Policy</a>
		<span class="footer-dot">&middot;</span>
		<a href="/terms">Terms of Service</a>
	</footer>
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

	.scroll-sentinel {
		height: 1px;
	}

	.home-footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 24px 0 16px;
		font-size: 12px;
		color: var(--text-tertiary);
	}

	.home-footer a {
		color: var(--text-tertiary);
		text-decoration: none;
	}

	.home-footer a:hover {
		color: var(--text-secondary);
		text-decoration: underline;
	}

	.footer-dot {
		font-size: 10px;
	}

	@media (max-width: 768px) {
		.home-page {
			padding: 8px 0;
		}
	}
</style>
