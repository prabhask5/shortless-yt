<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import type { VideoItem } from '$lib/types';
	import WatchPlayer from '$lib/components/WatchPlayer.svelte';
	import VideoMeta from '$lib/components/VideoMeta.svelte';
	import Description from '$lib/components/Description.svelte';
	import RelatedList from '$lib/components/RelatedList.svelte';
	import CommentList from '$lib/components/CommentList.svelte';
	import ShortsBlockPage from '$lib/components/ShortsBlockPage.svelte';
	import PremiumHelpModal from '$lib/components/PremiumHelpModal.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';

	let videoId = $derived($page.params.id ?? '');
	let video = $state<VideoItem | null>(null);
	let loading = $state(true);
	let error = $state('');
	let isShort = $state(false);
	let showAnyway = $state(false);
	let showPremiumHelp = $state(false);

	async function loadVideo(id: string) {
		loading = true;
		error = '';
		isShort = false;
		showAnyway = false;
		video = null;

		try {
			const res = await fetch(`/api/videos?ids=${id}`);
			if (!res.ok) throw new Error('Failed to load video');

			const data = await res.json();
			if (!data.items || data.items.length === 0) {
				throw new Error('Video not found');
			}

			video = data.items[0];
			isShort = video?.isShort || false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load video';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (videoId) {
			loadVideo(videoId);
		}
	});

	function handleShowAnyway() {
		showAnyway = true;
	}

	// Save to recent videos in localStorage
	onMount(() => {
		if (video && !video.isShort) {
			try {
				const recent = JSON.parse(localStorage.getItem('recent_videos') || '[]');
				const filtered = recent.filter((v: { id: string }) => v.id !== videoId);
				filtered.unshift({
					id: videoId,
					title: video.title,
					channelTitle: video.channelTitle,
					thumbnail: video.thumbnails?.medium?.url,
					timestamp: Date.now()
				});
				localStorage.setItem('recent_videos', JSON.stringify(filtered.slice(0, 20)));
			} catch {
				// ignore localStorage errors
			}
		}
	});
</script>

<svelte:head>
	<title>{video?.title || 'Loading...'} - Shortless Youtube</title>
</svelte:head>

{#if loading}
	<div class="watch-loading">
		<div class="skeleton" style="width:100%;aspect-ratio:16/9;border-radius:12px;"></div>
		<div class="skeleton" style="width:80%;height:24px;margin-top:16px;"></div>
		<div class="skeleton" style="width:40%;height:16px;margin-top:12px;"></div>
	</div>
{:else if error}
	<ErrorBanner message={error} />
{:else if isShort && !showAnyway}
	<ShortsBlockPage {videoId} onShowAnyway={handleShowAnyway} />
{:else if video}
	<div class="watch-page">
		<div class="watch-primary">
			<WatchPlayer {videoId} />
			<VideoMeta {video} onPremiumHelp={() => (showPremiumHelp = true)} />
			<Description text={video.description} />
			<CommentList {videoId} />
		</div>
		<aside class="watch-secondary">
			<RelatedList {videoId} />
		</aside>
	</div>

	<PremiumHelpModal {videoId} show={showPremiumHelp} onClose={() => (showPremiumHelp = false)} />
{/if}

<style>
	.watch-page {
		display: flex;
		gap: 24px;
		max-width: 1400px;
		margin: 0 auto;
	}

	.watch-primary {
		flex: 1;
		min-width: 0;
		max-width: var(--watch-player-max-width);
	}

	.watch-secondary {
		width: 400px;
		flex-shrink: 0;
	}

	.watch-loading {
		max-width: var(--watch-player-max-width);
	}

	@media (max-width: 1100px) {
		.watch-page {
			flex-direction: column;
		}

		.watch-secondary {
			width: 100%;
		}
	}

	@media (max-width: 768px) {
		.watch-primary {
			margin: -12px -12px 0;
		}

		.watch-primary :global(.player-wrapper) {
			border-radius: 0;
		}

		.watch-primary :global(.video-meta),
		.watch-primary :global(.description),
		.watch-primary :global(.comments-section) {
			padding-left: 12px;
			padding-right: 12px;
		}
	}
</style>
