<script lang="ts">
	/**
	 * Watch Page (/watch/[id]/+page.svelte)
	 *
	 * The video playback page. Displays:
	 * - Embedded YouTube player (WatchPlayer) for the selected video
	 * - Video metadata (title, channel, views, likes) via VideoMeta
	 * - Expandable description text via Description
	 * - Comment thread via CommentList
	 * - Related/suggested videos in a sidebar via RelatedList
	 * - Shorts blocking: if the video is detected as a Short, shows ShortsBlockPage
	 *   with an option to "show anyway"
	 * - PremiumHelpModal for YouTube Premium troubleshooting tips
	 *
	 * Data flow:
	 *   Route param [id] -> $derived(videoId) -> $effect triggers loadVideo(videoId)
	 *   loadVideo() fetches /api/videos?ids=<id> -> populates `video` state
	 *   If video.isShort, shows ShortsBlockPage instead of the player
	 *   On mount, saves the video to localStorage recent_videos list (max 20 entries)
	 *
	 * Layout:
	 *   Desktop: two-column (player+meta left, related sidebar right)
	 *   Mobile (<1100px): single column, stacked vertically
	 */
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

	/**
	 * $derived rune: Reactively extracts the video ID from the route parameter.
	 * Re-evaluates whenever the user navigates to a different /watch/[id] route.
	 */
	let videoId = $derived($page.params.id ?? '');
	/** $state rune: The loaded video metadata object, null until fetched */
	let video = $state<VideoItem | null>(null);
	/** $state rune: Whether the video data is currently being fetched */
	let loading = $state(true);
	/** $state rune: Error message from a failed fetch, empty string means no error */
	let error = $state('');
	/** $state rune: Whether the loaded video has been identified as a YouTube Short */
	let isShort = $state(false);
	/** $state rune: User override — if true, shows the Short video despite the block page */
	let showAnyway = $state(false);
	/** $state rune: Controls visibility of the Premium troubleshooting help modal */
	let showPremiumHelp = $state(false);

	/**
	 * Fetches video metadata from the /api/videos endpoint by video ID.
	 * Resets all state before loading to handle navigation between different videos.
	 *
	 * @param id - The YouTube video ID to fetch metadata for
	 */
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
			// Check the isShort flag (set by the server based on duration threshold)
			isShort = video?.isShort || false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load video';
		} finally {
			loading = false;
		}
	}

	/**
	 * $effect rune: Watches the derived videoId and triggers a fresh video load
	 * whenever it changes. This handles both initial page load and client-side
	 * navigation between different watch pages (e.g., clicking a related video).
	 */
	$effect(() => {
		if (videoId) {
			loadVideo(videoId);
		}
	});

	/**
	 * Event handler: Allows the user to bypass the Shorts block page and watch
	 * the Short video anyway using the embedded player.
	 */
	function handleShowAnyway() {
		showAnyway = true;
	}

	/**
	 * Lifecycle: On mount, saves the current video to the browser's localStorage
	 * recent_videos list for potential future "recently watched" features.
	 * - Deduplicates by removing any existing entry with the same ID
	 * - Prepends the new entry to the front (most recent first)
	 * - Limits the list to 20 entries
	 * - Only saves non-Short videos
	 */
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
				// ignore localStorage errors (e.g., storage full, private browsing restrictions)
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
