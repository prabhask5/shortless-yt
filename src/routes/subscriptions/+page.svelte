<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { authState, authLoading } from '$lib/stores/auth';
	import type { VideoItem, SearchResponse, SubscriptionChannel } from '$lib/types';
	import VideoGrid from '$lib/components/VideoGrid.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	let channels = $state<SubscriptionChannel[]>([]);
	let videos = $state<VideoItem[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state('');
	let nextPageToken = $state<string | undefined>();
	let reachedEnd = $state(false);
	let offset = $state(0);
	let sentinelEl: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver | null = null;
	let lastLoadTime = 0;

	async function loadSubscriptions() {
		try {
			const res = await fetch('/api/subscriptions');
			if (res.ok) {
				const data = await res.json();
				channels = data.channels || [];
			}
		} catch {
			// Non-critical
		}
	}

	async function loadFeed(isMore = false) {
		if (!isMore) {
			loading = true;
			videos = [];
			reachedEnd = false;
			offset = 0;
		} else {
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
				videos.push(...data.items);
			} else {
				videos = data.items;
			}

			nextPageToken = data.nextPageToken;
			offset += 4;

			if (!data.nextPageToken) reachedEnd = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load feed';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

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

	$effect(() => {
		if ($authState.isSignedIn && !$authLoading) {
			loadSubscriptions();
			loadFeed();
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

	$effect(() => {
		if (!$authLoading && !$authState.isSignedIn) {
			loading = false;
		}
	});

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
