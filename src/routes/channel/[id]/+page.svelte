<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { authState } from '$lib/stores/auth';
	import type { ChannelInfo, VideoItem, SearchResponse } from '$lib/types';
	import { formatSubscriberCount, formatViewCount } from '$lib/utils/format';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	let channelId = $derived($page.params.id || '');
	let channel = $state<ChannelInfo | null>(null);
	let videos = $state<VideoItem[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state('');
	let nextPageToken = $state<string | undefined>();
	let reachedEnd = $state(false);
	let sortOrder = $state<'date' | 'viewCount'>('date');
	let isSubscribed = $state(false);
	let sentinelEl: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver | null = null;
	let lastLoadTime = 0;

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
			const params = new URLSearchParams({ id: channelId, order: sortOrder });
			if (pageToken) params.set('pageToken', pageToken);

			const res = await fetch(`/api/channel/videos?${params}`);
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

	async function checkSubStatus() {
		if (!$authState.isSignedIn) return;
		try {
			const res = await fetch(`/api/subscriptions/check?channelId=${channelId}`);
			if (res.ok) {
				const data = await res.json();
				isSubscribed = data.isSubscribed;
			}
		} catch {
			// Non-critical
		}
	}

	function changeSort(order: 'date' | 'viewCount') {
		if (sortOrder === order) return;
		sortOrder = order;
		loading = true;
		loadVideos();
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
		if (channelId) {
			loadChannel();
			loadVideos();
			checkSubStatus();
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
