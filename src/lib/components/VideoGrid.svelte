<script lang="ts">
	/**
	 * VideoGrid.svelte
	 *
	 * Container component that renders a collection of VideoCard components
	 * in either a responsive CSS grid layout or a vertical list layout.
	 * Shows loading skeleton placeholders when fetching additional data.
	 *
	 * Used by the home page, channel page (grid mode), and search results (list mode).
	 */

	import type { VideoItem } from '$lib/types';
	import VideoCard from './VideoCard.svelte';
	import LoadingSkeletons from './LoadingSkeletons.svelte';

	interface Props {
		/** Array of video data objects to render as cards */
		videos: VideoItem[];
		/** Whether additional videos are currently being fetched (shows skeleton placeholders) */
		loading?: boolean;
		/** Display mode: 'grid' for responsive multi-column, 'list' for single-column horizontal cards */
		layout?: 'grid' | 'list';
	}

	/** Destructure props with Svelte 5 $props() rune; loading defaults to false, layout to 'grid' */
	let { videos, loading = false, layout = 'grid' }: Props = $props();
</script>

<!-- Render as a responsive CSS grid or a vertical list based on the layout prop.
     Each video is keyed by video.id for efficient DOM diffing during pagination updates.
     Loading skeletons are appended at the end when additional data is being fetched. -->
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
