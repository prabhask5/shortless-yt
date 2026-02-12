<script lang="ts">
	/**
	 * Playlist Page (/playlist/[id]/+page.svelte)
	 *
	 * Displays a YouTube playlist's metadata and its video items. Features:
	 * - Playlist header with thumbnail, title, channel link, video count, and description
	 * - List-layout video grid showing playlist items
	 * - Infinite scroll pagination to load more playlist videos
	 *
	 * Data flow:
	 *   Route param [id] -> $derived(playlistId) -> $effect triggers parallel loads:
	 *     1. loadPlaylist() -> /api/playlist?id=<id> -> populates playlist metadata
	 *     2. loadVideos() -> /api/playlist/videos?id=<id> -> populates videos[]
	 *   IntersectionObserver on sentinelEl -> triggers loadVideos(nextPageToken) for pagination
	 *
	 * Layout:
	 *   Desktop: horizontal header (thumbnail left, meta right) + list of videos below
	 *   Mobile (<768px): stacked header (thumbnail on top, meta below)
	 */
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { PlaylistInfo, VideoItem, SearchResponse } from '$lib/types';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	/**
	 * $derived rune: Reactively extracts the playlist ID from the route parameter.
	 * Updates when navigating between different playlist pages.
	 */
	let playlistId = $derived($page.params.id || '');
	/** $state rune: Playlist metadata (title, channel, thumbnail, item count), null until loaded */
	let playlist = $state<PlaylistInfo | null>(null);
	/** $state rune: List of video items in the playlist, paginated */
	let videos = $state<VideoItem[]>([]);
	/** $state rune: Whether the initial page load is in progress */
	let loading = $state(true);
	/** $state rune: Whether a pagination request is in progress */
	let loadingMore = $state(false);
	/** $state rune: Error message from a failed fetch, empty string means no error */
	let error = $state('');
	/** $state rune: YouTube API pagination token for the next page of playlist items */
	let nextPageToken = $state<string | undefined>();
	/** $state rune: Whether all playlist videos have been loaded (no more pages) */
	let reachedEnd = $state(false);
	/** $state rune: Bound reference to the sentinel <div> for infinite scroll */
	let sentinelEl: HTMLDivElement | undefined = $state();
	/** IntersectionObserver instance for infinite scroll; cleaned up on unmount */
	let observer: IntersectionObserver | null = null;
	/** Timestamp of the last pagination load, used for 500ms debounce */
	let lastLoadTime = 0;

	/**
	 * Fetches playlist metadata (title, description, thumbnails, channel info, item count)
	 * from the /api/playlist endpoint.
	 */
	async function loadPlaylist() {
		try {
			const res = await fetch(`/api/playlist?id=${playlistId}`);
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to load playlist');
			}
			playlist = await res.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load playlist';
		}
	}

	/**
	 * Fetches video items from the playlist via /api/playlist/videos.
	 * Supports pagination for playlists with many items.
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
			const params = new URLSearchParams({ id: playlistId });
			if (pageToken) params.set('pageToken', pageToken);

			const res = await fetch(`/api/playlist/videos?${params}`);
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
	 * $effect rune: Watches the derived playlistId. When navigating to a different playlist,
	 * triggers parallel loads for playlist metadata and playlist video items.
	 */
	$effect(() => {
		if (playlistId) {
			loadPlaylist();
			loadVideos();
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
	<title>{playlist?.title || 'Playlist'} - Shortless Youtube</title>
</svelte:head>

<div class="playlist-page">
	{#if error}
		<ErrorBanner message={error} onDismiss={() => (error = '')} />
	{/if}

	{#if playlist}
		<div class="playlist-header">
			<div class="playlist-thumb">
				{#if playlist.thumbnails.medium?.url || playlist.thumbnails.high?.url}
					<img
						src={playlist.thumbnails.high?.url || playlist.thumbnails.medium?.url || ''}
						alt={playlist.title}
						loading="eager"
						decoding="async"
						referrerpolicy="no-referrer"
					/>
				{/if}
			</div>
			<div class="playlist-meta">
				<h1 class="playlist-title">{playlist.title}</h1>
				<a href="/channel/{playlist.channelId}" class="playlist-channel">
					{#if playlist.channelThumbnail}
						<img
							src={playlist.channelThumbnail}
							alt={playlist.channelTitle}
							class="channel-thumb"
							loading="lazy"
							decoding="async"
							width="24"
							height="24"
							referrerpolicy="no-referrer"
						/>
					{/if}
					<span>{playlist.channelTitle}</span>
				</a>
				<div class="playlist-stats">
					<span>{playlist.itemCount} videos</span>
				</div>
				{#if playlist.description}
					<p class="playlist-desc">
						{playlist.description.slice(0, 200)}{playlist.description.length > 200 ? '...' : ''}
					</p>
				{/if}
			</div>
		</div>
	{/if}

	<VideoGrid {videos} loading={loading || loadingMore} layout="list" />
	<div bind:this={sentinelEl} class="scroll-sentinel" aria-hidden="true"></div>

	{#if reachedEnd && videos.length > 0 && !loading}
		<div class="end-of-results">
			<div class="end-line"></div>
			<span class="end-text">End of playlist</span>
			<div class="end-line"></div>
		</div>
	{/if}
</div>

<style>
	.playlist-page {
		max-width: 900px;
		margin: 0 auto;
		padding-bottom: calc(var(--bottomnav-height, 0px) + env(safe-area-inset-bottom, 0px) + 12px);
	}

	.playlist-header {
		display: flex;
		gap: 24px;
		margin-bottom: 24px;
	}

	.playlist-thumb {
		flex-shrink: 0;
		width: 320px;
		aspect-ratio: 16/9;
		border-radius: 12px;
		overflow: hidden;
		background: var(--skeleton-bg);
	}

	.playlist-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.playlist-meta {
		flex: 1;
		min-width: 0;
	}

	.playlist-title {
		font-size: 24px;
		font-weight: 600;
		margin-bottom: 12px;
		line-height: 1.3;
	}

	.playlist-channel {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-secondary);
		text-decoration: none;
		font-size: 14px;
		font-weight: 500;
		margin-bottom: 8px;
	}

	.playlist-channel:hover {
		color: var(--text-primary);
	}

	.channel-thumb {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
	}

	.playlist-stats {
		font-size: 14px;
		color: var(--text-secondary);
		margin-bottom: 12px;
	}

	.playlist-desc {
		font-size: 13px;
		color: var(--text-secondary);
		line-height: 1.5;
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
		.playlist-header {
			flex-direction: column;
			gap: 16px;
		}

		.playlist-thumb {
			width: 100%;
		}

		.playlist-title {
			font-size: 18px;
		}

		.playlist-meta {
			padding: 0 12px;
		}
	}
</style>
