<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { PlaylistInfo, VideoItem, SearchResponse } from '$lib/types';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	let playlistId = $derived($page.params.id || '');
	let playlist = $state<PlaylistInfo | null>(null);
	let videos = $state<VideoItem[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state('');
	let nextPageToken = $state<string | undefined>();
	let reachedEnd = $state(false);
	let sentinelEl: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver | null = null;
	let lastLoadTime = 0;

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

	async function loadVideos(pageToken?: string) {
		if (!pageToken) {
			videos = [];
			reachedEnd = false;
		} else {
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
				videos.push(...data.items);
			} else {
				videos = data.items;
			}

			nextPageToken = data.nextPageToken;
			if (!data.nextPageToken) reachedEnd = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load videos';
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
					loadVideos(nextPageToken);
				}
			},
			{ rootMargin: '400px' }
		);
		if (sentinelEl) observer.observe(sentinelEl);
	}

	$effect(() => {
		if (playlistId) {
			loadPlaylist();
			loadVideos();
		}
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
