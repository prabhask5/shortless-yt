<script lang="ts">
	/**
	 * Channel Page (/channel/[id]/+page.svelte)
	 *
	 * Displays a YouTube channel's profile and video uploads. Features:
	 * - Channel banner image, avatar, title, handle, subscriber count, and video count
	 * - Truncated channel description (first 200 chars)
	 * - Sort tabs: Latest (by date) or Popular (by view count)
	 * - Infinite scroll grid of the channel's uploaded videos
	 * - "Subscribed" badge if the signed-in user is subscribed to this channel
	 *
	 * Data flow:
	 *   Route param [id] -> $derived(channelId) -> $effect triggers three parallel loads:
	 *     1. loadChannel() -> /api/channel?id=<id> -> populates channel metadata
	 *     2. loadVideos() -> /api/channel/videos?id=<id>&order=<sort> -> populates videos[]
	 *     3. checkSubStatus() -> /api/subscriptions/check?channelId=<id> -> sets isSubscribed
	 *   IntersectionObserver on sentinelEl -> triggers loadVideos(nextPageToken) for pagination
	 *   Sort change -> resets videos and re-fetches with new order parameter
	 */
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { authState } from '$lib/stores/auth';
	import type { ChannelInfo, VideoItem, SearchResponse } from '$lib/types';
	import { formatSubscriberCount, formatViewCount } from '$lib/utils/format';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	/**
	 * $derived rune: Reactively extracts the channel ID from the route parameter.
	 * Updates when navigating between different channel pages.
	 */
	let channelId = $derived($page.params.id || '');
	/** $state rune: Channel metadata (title, description, thumbnails, stats), null until loaded */
	let channel = $state<ChannelInfo | null>(null);
	/** $state rune: List of the channel's uploaded videos, paginated */
	let videos = $state<VideoItem[]>([]);
	/** $state rune: Whether the initial page load is in progress */
	let loading = $state(true);
	/** $state rune: Whether a pagination request for more videos is in progress */
	let loadingMore = $state(false);
	/** $state rune: Error message from a failed fetch, empty string means no error */
	let error = $state('');
	/** $state rune: YouTube API pagination token for the next page of channel videos */
	let nextPageToken = $state<string | undefined>();
	/** $state rune: Whether all channel videos have been loaded (no more pages) */
	let reachedEnd = $state(false);
	/** $state rune: Current sort order for channel videos — 'date' (newest) or 'viewCount' (most popular) */
	let sortOrder = $state<'date' | 'viewCount'>('date');
	/** $state rune: Whether the signed-in user is subscribed to this channel */
	let isSubscribed = $state(false);
	/** $state rune: Bound reference to the sentinel <div> for infinite scroll */
	let sentinelEl: HTMLDivElement | undefined = $state();
	/** IntersectionObserver instance for infinite scroll; cleaned up on unmount */
	let observer: IntersectionObserver | null = null;
	/** Timestamp of the last pagination load, used for 500ms debounce */
	let lastLoadTime = 0;

	/**
	 * Fetches channel metadata (title, description, thumbnails, subscriber count, etc.)
	 * from the /api/channel endpoint.
	 */
	async function loadChannel() {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/channel?id=${channelId}`);
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to load channel');
			}
			channel = await res.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load channel';
		}
	}

	/**
	 * Fetches the channel's video uploads from /api/channel/videos.
	 * Supports pagination and sort ordering.
	 *
	 * @param pageToken - YouTube API page token for fetching the next page.
	 *                    If omitted, performs a fresh load (resets videos array).
	 */
	async function loadVideos(pageToken?: string) {
		if (!pageToken) {
			// Fresh load: reset video list and pagination state
			videos = [];
			reachedEnd = false;
		} else {
			// Pagination: enforce 500ms debounce against IntersectionObserver rapid-fire
			const now = Date.now();
			if (now - lastLoadTime < 500) return;
			lastLoadTime = now;
			loadingMore = true;
		}

		try {
			const params = new URLSearchParams({ id: channelId, order: sortOrder });
			if (pageToken) params.set('pageToken', pageToken);

			const res = await fetch(`/api/channel/videos?${params}`);
			if (!res.ok) throw new Error('Failed to load videos');

			const data: SearchResponse = await res.json();

			if (pageToken) {
				// Pagination: append via .push() for efficient Svelte 5 proxy reactivity
				videos.push(...data.items);
			} else {
				videos = data.items;
			}

			nextPageToken = data.nextPageToken;
			if (!data.nextPageToken) reachedEnd = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load videos';
			nextPageToken = undefined;
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	/**
	 * Checks whether the currently signed-in user is subscribed to this channel.
	 * Only runs if the user is authenticated. Non-critical — failures are silently ignored.
	 * Sets the isSubscribed flag which controls the "Subscribed" badge display.
	 */
	async function checkSubStatus() {
		if (!$authState.isSignedIn) return;
		try {
			const res = await fetch(`/api/subscriptions/check?channelId=${channelId}`);
			if (res.ok) {
				const data = await res.json();
				isSubscribed = data.isSubscribed;
			}
		} catch {
			// Non-critical: subscription status is informational only
		}
	}

	/**
	 * Switches the video sort order and re-fetches the video list from scratch.
	 * No-ops if the requested order is already active.
	 *
	 * @param order - The sort order to switch to ('date' or 'viewCount')
	 */
	function changeSort(order: 'date' | 'viewCount') {
		if (sortOrder === order) return;
		sortOrder = order;
		loading = true;
		loadVideos();
	}

	/**
	 * Creates an IntersectionObserver on the sentinel element for infinite scroll.
	 * Uses 400px rootMargin to preload before the user reaches the bottom.
	 * Guards prevent duplicate requests during active loads.
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
					loadVideos(nextPageToken);
				}
			},
			{ rootMargin: '400px' }
		);
		if (sentinelEl) observer.observe(sentinelEl);
	}

	/**
	 * $effect rune: Watches the derived channelId. When navigating to a different channel,
	 * triggers parallel loads for channel metadata, video uploads, and subscription status.
	 */
	$effect(() => {
		if (channelId) {
			loadChannel();
			loadVideos();
			checkSubStatus();
		}
	});

	/**
	 * $effect rune: Attaches the IntersectionObserver once the sentinel element is bound.
	 * Returns a cleanup function to disconnect the observer on unmount or element removal.
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
	 * Lifecycle: Cleanup on unmount — disconnects the IntersectionObserver.
	 */
	onMount(() => {
		return () => {
			observer?.disconnect();
		};
	});
</script>

<svelte:head>
	<title>{channel?.title || 'Channel'} - Shortless Youtube</title>
</svelte:head>

<div class="channel-page">
	{#if error}
		<ErrorBanner message={error} onDismiss={() => (error = '')} />
	{/if}

	{#if channel}
		{#if channel.bannerUrl}
			<div class="channel-banner">
				<img
					src="{channel.bannerUrl}=w1707"
					alt="Channel banner"
					loading="eager"
					class="banner-img"
				/>
			</div>
		{/if}

		<div class="channel-header">
			<div class="channel-avatar">
				{#if channel.thumbnails.medium?.url || channel.thumbnails.default?.url}
					<img
						src={channel.thumbnails.medium?.url || channel.thumbnails.default?.url}
						alt={channel.title}
						loading="eager"
						decoding="async"
						width="80"
						height="80"
						referrerpolicy="no-referrer"
					/>
				{:else}
					<div class="avatar-fallback">{channel.title.charAt(0).toUpperCase()}</div>
				{/if}
			</div>
			<div class="channel-meta">
				<h1 class="channel-title">{channel.title}</h1>
				<div class="channel-stats">
					{#if channel.customUrl}
						<span class="channel-handle">{channel.customUrl}</span>
						<span class="stats-dot">&middot;</span>
					{/if}
					<span>{formatSubscriberCount(channel.subscriberCount)}</span>
					<span class="stats-dot">&middot;</span>
					<span>{channel.videoCount} videos</span>
				</div>
				{#if isSubscribed}
					<span class="subscribed-badge">Subscribed</span>
				{/if}
			</div>
		</div>

		{#if channel.description}
			<p class="channel-description">
				{channel.description.slice(0, 200)}{channel.description.length > 200 ? '...' : ''}
			</p>
		{/if}

		<div class="sort-tabs" role="tablist">
			<button
				class="sort-tab"
				class:active={sortOrder === 'date'}
				role="tab"
				aria-selected={sortOrder === 'date'}
				onclick={() => changeSort('date')}>Latest</button
			>
			<button
				class="sort-tab"
				class:active={sortOrder === 'viewCount'}
				role="tab"
				aria-selected={sortOrder === 'viewCount'}
				onclick={() => changeSort('viewCount')}>Popular</button
			>
		</div>
	{/if}

	<VideoGrid {videos} loading={loading || loadingMore} />
	<div bind:this={sentinelEl} class="scroll-sentinel" aria-hidden="true"></div>

	{#if reachedEnd && videos.length > 0 && !loading}
		<div class="end-of-results">
			<div class="end-line"></div>
			<span class="end-text">No more videos</span>
			<div class="end-line"></div>
		</div>
	{/if}
</div>

<style>
	.channel-page {
		max-width: 1200px;
		margin: 0 auto;
		padding-bottom: calc(var(--bottomnav-height, 0px) + env(safe-area-inset-bottom, 0px) + 12px);
	}

	.channel-banner {
		width: 100%;
		aspect-ratio: 6.2/1;
		border-radius: 12px;
		overflow: hidden;
		margin-bottom: 16px;
		background: var(--skeleton-bg);
	}

	.banner-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.channel-header {
		display: flex;
		align-items: center;
		gap: 20px;
		margin-bottom: 12px;
	}

	.channel-avatar img {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
	}

	.avatar-fallback {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: var(--bg-tertiary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 32px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.channel-meta {
		flex: 1;
		min-width: 0;
	}

	.channel-title {
		font-size: 24px;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.channel-stats {
		font-size: 14px;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.channel-handle {
		color: var(--text-secondary);
	}

	.stats-dot {
		font-size: 10px;
	}

	.subscribed-badge {
		display: inline-block;
		margin-top: 8px;
		padding: 4px 12px;
		background: var(--bg-tertiary);
		border-radius: 16px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.channel-description {
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.5;
		margin-bottom: 16px;
	}

	.sort-tabs {
		display: flex;
		gap: 8px;
		margin-bottom: 20px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: x mandatory;
	}

	.sort-tab {
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

	.sort-tab.active {
		background: var(--text-primary);
		color: var(--bg-primary);
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
		.channel-banner {
			border-radius: 0;
		}

		.channel-header {
			padding: 0 12px;
		}

		.channel-avatar img,
		.avatar-fallback {
			width: 60px;
			height: 60px;
			font-size: 24px;
		}

		.channel-title {
			font-size: 18px;
		}

		.channel-stats {
			font-size: 12px;
		}

		.channel-description {
			padding: 0 12px;
			font-size: 13px;
		}

		.sort-tabs {
			padding: 0 12px;
		}
	}
</style>
