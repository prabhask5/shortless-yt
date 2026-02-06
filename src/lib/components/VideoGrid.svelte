<script lang="ts">
	import type { VideoItem } from '$lib/types';
	import VideoCard from './VideoCard.svelte';
	import LoadingSkeletons from './LoadingSkeletons.svelte';

	interface Props {
		videos: VideoItem[];
		loading?: boolean;
		layout?: 'grid' | 'list';
	}

	let { videos, loading = false, layout = 'grid' }: Props = $props();
</script>

{#if layout === 'grid'}
	<div class="video-grid">
		{#each videos as video (video.id)}
			<VideoCard {video} layout="grid" />
		{/each}
		{#if loading}
			<LoadingSkeletons count={4} layout="grid" />
		{/if}
	</div>
{:else}
	<div class="video-list">
		{#each videos as video (video.id)}
			<VideoCard {video} layout="list" />
		{/each}
		{#if loading}
			<LoadingSkeletons count={3} layout="list" />
		{/if}
	</div>
{/if}

<style>
	.video-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 16px;
	}

	.video-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	@media (max-width: 768px) {
		.video-grid {
			grid-template-columns: 1fr;
			gap: 8px;
		}
	}
</style>
