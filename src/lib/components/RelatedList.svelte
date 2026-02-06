<script lang="ts">
	import type { VideoItem } from '$lib/types';
	import VideoCard from './VideoCard.svelte';
	import LoadingSkeletons from './LoadingSkeletons.svelte';

	interface Props {
		videoId: string;
	}

	let { videoId }: Props = $props();

	let videos = $state<VideoItem[]>([]);
	let loading = $state(true);
	let error = $state('');
	let nextPageToken = $state<string | undefined>();

	async function loadRelated(pageToken?: string) {
		if (!pageToken) loading = true;
		error = '';

		try {
			const params = new URLSearchParams({ id: videoId });
			if (pageToken) params.set('pageToken', pageToken);

			const res = await fetch(`/api/related?${params}`);
			if (!res.ok) throw new Error('Failed to load related videos');

			const data = await res.json();
			if (pageToken) {
				videos = [...videos, ...data.items];
			} else {
				videos = data.items;
			}
			nextPageToken = data.nextPageToken;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (videoId) {
			videos = [];
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
			{#each videos as video (video.id)}
				<VideoCard {video} layout="compact" />
			{/each}
		</div>

		{#if nextPageToken}
			<button class="load-more btn btn-secondary" onclick={() => loadRelated(nextPageToken)}>
				Show more
			</button>
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

	@media (max-width: 768px) {
		.related-title {
			display: block;
		}
	}
</style>
