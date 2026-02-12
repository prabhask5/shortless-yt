<script lang="ts">
	/**
	 * RelatedList.svelte
	 *
	 * Sidebar component on the watch page that shows two sections:
	 *   1. "Related videos" -- fetched from /api/related based on the current videoId
	 *   2. "Recommended" -- fetched from /api/recommended (general suggestions),
	 *      loaded automatically after related videos finish, displayed below a divider
	 *
	 * Both sections support pagination via "Show more" buttons.
	 * A SvelteSet (`shownIds`) deduplicates videos across both sections so the
	 * user never sees the same video twice in the sidebar.
	 *
	 * Uses .push() for pagination updates because Svelte 5's reactivity proxy
	 * detects array mutations efficiently (avoids creating new arrays on every page load).
	 */

	import { SvelteSet } from 'svelte/reactivity';
	import type { VideoItem } from '$lib/types';
	import VideoCard from './VideoCard.svelte';
	import LoadingSkeletons from './LoadingSkeletons.svelte';

	interface Props {
		/** The YouTube video ID currently being watched; related videos are fetched based on this */
		videoId: string;
	}

	/** Destructure props with Svelte 5 $props() rune */
	let { videoId }: Props = $props();

	/** $state rune: array of related videos (contextually similar to the current video) */
	let relatedVideos = $state<VideoItem[]>([]);
	/** $state rune: array of general recommended videos (shown below the related section) */
	let recommendedVideos = $state<VideoItem[]>([]);
	/** $state rune: true during initial related-video fetch (shows skeleton placeholders) */
	let loading = $state(true);
	/** $state rune: true while the recommended section is loading for the first time */
	let loadingRecommended = $state(false);
	/** $state rune: error message from a failed related-video fetch */
	let error = $state('');
	/** $state rune: pagination token for the next page of related videos */
	let nextRelatedToken = $state<string | undefined>();
	/** $state rune: pagination token for the next page of recommended videos */
	let nextRecommendedToken = $state<string | undefined>();
	/** $state rune: offset counter for the recommended API to avoid re-fetching the same batch */
	let recommendedOffset = $state(0);
	/** $state rune: true while fetching an additional page of recommended videos (disables button) */
	let showMoreLoading = $state(false);
	/**
	 * SvelteSet: tracks all video IDs already displayed (current video + related + recommended).
	 * Used to filter out duplicates when recommended results overlap with related results.
	 * SvelteSet is used instead of a plain Set so Svelte's reactivity system can track mutations.
	 */
	let shownIds = new SvelteSet<string>();

	/**
	 * Fetches related videos from the server API.
	 * On initial load (no pageToken), replaces the array and shows skeleton.
	 * On pagination (with pageToken), appends to the existing array via .push().
	 * After the initial related load completes, automatically triggers loadRecommended()
	 * to populate the "Recommended" section below.
	 * @param pageToken - Optional YouTube API page token for fetching the next page
	 */
	async function loadRelated(pageToken?: string) {
		if (!pageToken) loading = true;
		error = '';

		try {
			const params = new URLSearchParams({ id: videoId });
			if (pageToken) params.set('pageToken', pageToken);

			const res = await fetch(`/api/related?${params}`);
			if (!res.ok) throw new Error('Failed to load related videos');

			const data = await res.json();
			const newVideos: VideoItem[] = data.items;

			if (pageToken) {
				// Pagination: use .push() for efficient Svelte 5 proxy mutation detection
				relatedVideos.push(...newVideos);
			} else {
				relatedVideos = newVideos;
			}
			nextRelatedToken = data.nextPageToken;

			// Track shown IDs for dedup: include the current video and all related videos
			shownIds.add(videoId);
			for (const v of relatedVideos) shownIds.add(v.id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loading = false;
			// Automatically load recommended videos after related finishes (first load only)
			if (!loadingRecommended && recommendedVideos.length === 0) {
				loadRecommended();
			}
		}
	}

	/**
	 * Fetches general recommended videos from the server API.
	 * Filters out any videos already shown in the related section (via shownIds).
	 * Uses an offset parameter to avoid re-fetching previously seen batches.
	 * Recommended fetch is best-effort -- errors are silently ignored.
	 * @param pageToken - Optional pagination token for fetching the next page
	 */
	async function loadRecommended(pageToken?: string) {
		if (pageToken) {
			showMoreLoading = true;
		} else {
			loadingRecommended = true;
		}

		try {
			const params = new URLSearchParams();
			if (pageToken) params.set('pageToken', pageToken);
			if (recommendedOffset > 0) params.set('offset', String(recommendedOffset));

			const res = await fetch(`/api/recommended?${params}`);
			if (!res.ok) return;

			const data = await res.json();
			// Filter out any videos that are already displayed in the related section
			const newVideos: VideoItem[] = (data.items || []).filter(
				(v: VideoItem) => !shownIds.has(v.id)
			);

			// Track newly shown video IDs to prevent future duplicates
			for (const v of newVideos) shownIds.add(v.id);

			if (pageToken) {
				// Pagination: use .push() for efficient Svelte 5 proxy mutation detection
				recommendedVideos.push(...newVideos);
			} else {
				recommendedVideos = newVideos;
			}
			nextRecommendedToken = data.nextPageToken;
			if (data.nextPageToken) {
				// Advance offset by 4 so the next page request skips already-fetched items
				recommendedOffset += 4;
			}
		} catch {
			// Recommended is best-effort -- silently swallow errors
		} finally {
			loadingRecommended = false;
			showMoreLoading = false;
		}
	}

	/**
	 * $effect rune: reacts to changes in `videoId`.
	 * When the user navigates to a different watch page, resets all state
	 * (both video arrays, dedup set, pagination tokens, offset) and kicks
	 * off a fresh related-video fetch for the new video.
	 */
	$effect(() => {
		if (videoId) {
			relatedVideos = [];
			recommendedVideos = [];
			shownIds.clear();
			nextRecommendedToken = undefined;
			recommendedOffset = 0;
			loadRelated();
		}
	});
</script>

<!-- Related/recommended videos sidebar on the watch page -->
<div class="related-section">
	<!-- Title is hidden on desktop (CSS display:none) and shown on mobile -->
	<h3 class="related-title">Related videos</h3>

	<!-- State-based rendering: loading skeletons -> error -> video list + recommended -->
	{#if loading}
		<div class="related-list">
			<LoadingSkeletons count={8} layout="compact" />
		</div>
	{:else if error}
		<div class="related-error">{error}</div>
	{:else}
		<!-- Related videos: contextually similar to the currently playing video -->
		<div class="related-list">
			{#each relatedVideos as video (video.id)}
				<VideoCard {video} layout="compact" />
			{/each}
		</div>

		<!-- Pagination button for related videos (only if the API returned a next page token) -->
		{#if nextRelatedToken}
			<button class="load-more btn btn-secondary" onclick={() => loadRelated(nextRelatedToken)}>
				Show more
			</button>
		{/if}

		<!-- Recommended section: general suggestions, shown below a labeled divider.
		     Videos are deduplicated against the related list via shownIds. -->
		{#if recommendedVideos.length > 0}
			<div class="recommended-divider">
				<div class="divider-line"></div>
				<span class="divider-label">Recommended</span>
				<div class="divider-line"></div>
			</div>

			<div class="related-list">
				{#each recommendedVideos as video (video.id)}
					<VideoCard {video} layout="compact" />
				{/each}
			</div>

			{#if nextRecommendedToken}
				<button
					class="load-more btn btn-secondary"
					disabled={showMoreLoading}
					onclick={() => loadRecommended(nextRecommendedToken)}
				>
					{showMoreLoading ? 'Loading...' : 'Show more'}
				</button>
			{/if}
		{:else if loadingRecommended}
			<!-- Show skeleton placeholders while the recommended section is loading -->
			<div class="recommended-divider">
				<div class="divider-line"></div>
				<span class="divider-label">Recommended</span>
				<div class="divider-line"></div>
			</div>
			<div class="related-list">
				<LoadingSkeletons count={4} layout="compact" />
			</div>
		{/if}
	{/if}
</div>

<style>
	.related-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.related-title {
		font-size: 16px;
		font-weight: 600;
		display: none;
	}

	.related-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.related-error {
		font-size: 14px;
		color: var(--text-secondary);
		padding: 16px 0;
	}

	.load-more {
		margin: 8px 0;
		align-self: center;
	}

	.recommended-divider {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 16px 0 8px;
	}

	.divider-line {
		flex: 1;
		height: 1px;
		background: var(--border-color, #e0e0e0);
	}

	.divider-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	@media (max-width: 768px) {
		.related-title {
			display: block;
		}
	}
</style>
