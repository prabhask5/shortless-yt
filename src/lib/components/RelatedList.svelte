<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { VideoItem } from '$lib/types';
	import VideoCard from './VideoCard.svelte';
	import LoadingSkeletons from './LoadingSkeletons.svelte';

	interface Props {
		videoId: string;
	}

	let { videoId }: Props = $props();

	let relatedVideos = $state<VideoItem[]>([]);
	let recommendedVideos = $state<VideoItem[]>([]);
	let loading = $state(true);
	let loadingRecommended = $state(false);
	let error = $state('');
	let nextRelatedToken = $state<string | undefined>();
	let nextRecommendedToken = $state<string | undefined>();
	let recommendedOffset = $state(0);
	let showMoreLoading = $state(false);
	let shownIds = new SvelteSet<string>();

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
				relatedVideos.push(...newVideos);
			} else {
				relatedVideos = newVideos;
			}
			nextRelatedToken = data.nextPageToken;

			// Track shown IDs for dedup
			shownIds.add(videoId);
			for (const v of relatedVideos) shownIds.add(v.id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loading = false;
			// Load recommended after related finishes
			if (!loadingRecommended && recommendedVideos.length === 0) {
				loadRecommended();
			}
		}
	}

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
			const newVideos: VideoItem[] = (data.items || []).filter(
				(v: VideoItem) => !shownIds.has(v.id)
			);

			// Track new IDs
			for (const v of newVideos) shownIds.add(v.id);

			if (pageToken) {
				recommendedVideos.push(...newVideos);
			} else {
				recommendedVideos = newVideos;
			}
			nextRecommendedToken = data.nextPageToken;
			if (data.nextPageToken) {
				recommendedOffset += 4;
			}
		} catch {
			// Recommended is best-effort
		} finally {
			loadingRecommended = false;
			showMoreLoading = false;
		}
	}

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

<div class="related-section">
	<h3 class="related-title">Related videos</h3>

	{#if loading}
		<div class="related-list">
			<LoadingSkeletons count={8} layout="compact" />
		</div>
	{:else if error}
		<div class="related-error">{error}</div>
	{:else}
		<div class="related-list">
			{#each relatedVideos as video (video.id)}
				<VideoCard {video} layout="compact" />
			{/each}
		</div>

		{#if nextRelatedToken}
			<button class="load-more btn btn-secondary" onclick={() => loadRelated(nextRelatedToken)}>
				Show more
			</button>
		{/if}

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
