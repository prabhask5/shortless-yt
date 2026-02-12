<script lang="ts">
	/**
	 * Subscriptions Page (/subscriptions/+page.svelte)
	 *
	 * Displays a personalized feed of videos from the user's YouTube subscriptions.
	 * Requires Google sign-in to access subscription data. Features:
	 * - Horizontal scrollable row of subscribed channel avatars (chip links)
	 * - Video grid feed from /api/recommended (uses subscription data when authenticated)
	 * - Infinite scroll pagination
	 * - Sign-in prompt for unauthenticated users
	 * - Loading spinner while auth state is being determined
	 *
	 * Data flow:
	 *   Auth state check ($effect):
	 *     - If signed in: loadSubscriptions() + loadFeed() run in parallel
	 *     - If not signed in: shows sign-in prompt
	 *   loadSubscriptions() -> /api/subscriptions -> populates channel chips bar
	 *   loadFeed() -> /api/recommended?offset=<n>&pageToken=<token> -> populates videos[]
	 *   IntersectionObserver on sentinelEl -> triggers loadFeed(true) for pagination
	 *   Offset increments by 4 per page for subscription channel rotation on the server
	 */
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { authState, authLoading } from '$lib/stores/auth';
	import type { VideoItem, SearchResponse, SubscriptionChannel } from '$lib/types';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	/** $state rune: List of the user's subscribed YouTube channels, displayed as chip links */
	let channels = $state<SubscriptionChannel[]>([]);
	/** $state rune: Video feed items from subscribed channels */
	let videos = $state<VideoItem[]>([]);
	/** $state rune: Whether the initial feed load is in progress */
	let loading = $state(true);
	/** $state rune: Whether a pagination (load more) request is in progress */
	let loadingMore = $state(false);
	/** $state rune: Error message from a failed fetch, empty string means no error */
	let error = $state('');
	/** $state rune: YouTube API pagination token for the next page of feed results */
	let nextPageToken = $state<string | undefined>();
	/** $state rune: Whether all available feed results have been exhausted */
	let reachedEnd = $state(false);
	/**
	 * $state rune: Offset counter for server-side subscription channel rotation.
	 * Incremented by 4 per page so the server queries different channels each time,
	 * providing variety in the subscription feed.
	 */
	let offset = $state(0);
	/** $state rune: Bound reference to the sentinel <div> for infinite scroll */
	let sentinelEl: HTMLDivElement | undefined = $state();
	/** IntersectionObserver instance for infinite scroll; cleaned up on unmount */
	let observer: IntersectionObserver | null = null;
	/** Timestamp of the last pagination load, used for 500ms debounce */
	let lastLoadTime = 0;

	/**
	 * Fetches the user's YouTube subscription channel list from /api/subscriptions.
	 * These are displayed as clickable avatar chips above the video feed.
	 * Non-critical: failures are silently ignored since the feed can work without chips.
	 */
	async function loadSubscriptions() {
		try {
			const res = await fetch('/api/subscriptions');
			if (res.ok) {
				const data = await res.json();
				channels = data.channels || [];
			}
		} catch {
			// Non-critical: channel chips are informational only
		}
	}

	/**
	 * Fetches the subscription-based video feed from /api/recommended.
	 * Uses offset parameter for server-side channel rotation across pages.
	 *
	 * @param isMore - If true, this is a pagination request (appends to existing videos).
	 *                 If false (default), this is a fresh load (resets all state).
	 */
	async function loadFeed(isMore = false) {
		if (!isMore) {
			// Fresh load: reset all state
			loading = true;
			videos = [];
			reachedEnd = false;
			offset = 0;
		} else {
			// Pagination: enforce 500ms debounce against IntersectionObserver rapid-fire
			const now = Date.now();
			if (now - lastLoadTime < 500) return;
			lastLoadTime = now;
			loadingMore = true;
		}

		try {
			const params = new URLSearchParams();
			if (isMore) params.set('offset', String(offset));
			if (nextPageToken) params.set('pageToken', nextPageToken);

			const res = await fetch(`/api/recommended?${params}`);
			if (!res.ok) throw new Error('Failed to load feed');

			const data: SearchResponse = await res.json();

			if (isMore) {
				// Pagination: append via .push() for efficient Svelte 5 proxy reactivity
				videos.push(...data.items);
			} else {
				videos = data.items;
			}

			nextPageToken = data.nextPageToken;
			// Advance offset by 4 so the server rotates to different subscription channels
			offset += 4;

			if (!data.nextPageToken) reachedEnd = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load feed';
			nextPageToken = undefined;
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	/**
	 * Creates an IntersectionObserver on the sentinel element for infinite scroll.
	 * Uses 400px rootMargin to preload before the user reaches the bottom.
	 * Note: unlike other pages, this observer does not check nextPageToken because
	 * the feed may continue even when the token is temporarily undefined.
	 */
	function setupObserver() {
		if (!browser || observer) return;
		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !loadingMore && !loading && !reachedEnd) {
					loadFeed(true);
				}
			},
			{ rootMargin: '400px' }
		);
		if (sentinelEl) observer.observe(sentinelEl);
	}

	/**
	 * $effect rune: Watches auth state. Once the user is confirmed signed in (and auth
	 * loading is complete), triggers parallel loads for subscriptions and feed.
	 * This ensures the page does not attempt API calls that require auth before
	 * the session is verified.
	 */
	$effect(() => {
		if ($authState.isSignedIn && !$authLoading) {
			loadSubscriptions();
			loadFeed();
		}
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
	 * $effect rune: Handles the unauthenticated state. Once auth loading completes
	 * and the user is confirmed NOT signed in, stops the loading spinner so the
	 * sign-in prompt is shown immediately instead of an indefinite spinner.
	 */
	$effect(() => {
		if (!$authLoading && !$authState.isSignedIn) {
			loading = false;
		}
	});

	/**
	 * Lifecycle: Cleanup on unmount — disconnects the IntersectionObserver.
	 */
	onMount(() => {
		return () => {
			observer?.disconnect();
		};
	});
</script>

<svelte:head>
	<title>Subscriptions - Shortless Youtube</title>
</svelte:head>

<div class="subscriptions-page">
	{#if error}
		<ErrorBanner message={error} onDismiss={() => (error = '')} />
	{/if}

	{#if $authLoading}
		<div class="loading-state">
			<div class="spinner"></div>
		</div>
	{:else if !$authState.isSignedIn}
		<div class="signed-out">
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
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
				<circle cx="9" cy="7" r="4" />
				<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
				<path d="M16 3.13a4 4 0 0 1 0 7.75" />
			</svg>
			<h2>Your subscriptions</h2>
			<p>Sign in to see videos from your favorite channels</p>
			<a href="/api/auth/login" class="sign-in-btn">Sign in</a>
		</div>
	{:else}
		{#if channels.length > 0}
			<div class="channel-chips-bar">
				<div class="channel-chips">
					{#each channels as ch (ch.channelId)}
						<a href="/channel/{ch.channelId}" class="channel-chip">
							{#if ch.thumbnailUrl}
								<img
									src={ch.thumbnailUrl}
									alt={ch.title}
									loading="lazy"
									decoding="async"
									width="36"
									height="36"
									referrerpolicy="no-referrer"
								/>
							{:else}
								<div class="chip-avatar-fallback">{ch.title.charAt(0).toUpperCase()}</div>
							{/if}
							<span class="chip-name">{ch.title}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<VideoGrid {videos} loading={loading || loadingMore} />
		<div bind:this={sentinelEl} class="scroll-sentinel" aria-hidden="true"></div>

		{#if reachedEnd && videos.length > 0 && !loading}
			<div class="end-of-results">
				<div class="end-line"></div>
				<span class="end-text">You've reached the end</span>
				<div class="end-line"></div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.subscriptions-page {
		max-width: 1200px;
		margin: 0 auto;
		padding-bottom: calc(var(--bottomnav-height, 0px) + env(safe-area-inset-bottom, 0px) + 12px);
	}

	.loading-state {
		display: flex;
		justify-content: center;
		padding: 48px 0;
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

	.signed-out {
		text-align: center;
		padding: 80px 20px;
		color: var(--text-secondary);
	}

	.signed-out svg {
		margin-bottom: 16px;
		opacity: 0.4;
	}

	.signed-out h2 {
		font-size: 20px;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 8px;
	}

	.signed-out p {
		font-size: 14px;
		margin-bottom: 24px;
	}

	.sign-in-btn {
		display: inline-block;
		padding: 10px 24px;
		background: #cc0000;
		color: white;
		border-radius: 20px;
		text-decoration: none;
		font-size: 14px;
		font-weight: 500;
		min-height: 44px;
		line-height: 24px;
	}

	.sign-in-btn:hover {
		background: #aa0000;
		text-decoration: none;
	}

	.channel-chips-bar {
		margin-bottom: 20px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: x mandatory;
	}

	.channel-chips {
		display: flex;
		gap: 12px;
		padding: 4px 0;
	}

	.channel-chip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-decoration: none;
		color: var(--text-primary);
		min-width: fit-content;
		scroll-snap-align: start;
		padding: 4px 8px;
		border-radius: 8px;
		transition: background-color 0.15s;
		min-height: 44px;
	}

	.channel-chip:hover {
		background: var(--bg-hover);
		text-decoration: none;
	}

	.channel-chip img {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
	}

	.chip-avatar-fallback {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--bg-tertiary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.chip-name {
		font-size: 11px;
		max-width: 72px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: center;
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
