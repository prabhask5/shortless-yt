<script lang="ts">
	import type { VideoItem } from '$lib/types';
	import { formatViewCount, formatDuration, formatRelativeTime } from '$lib/utils/format';

	interface Props {
		video: VideoItem;
		layout?: 'grid' | 'list' | 'compact';
	}

	let { video, layout = 'grid' }: Props = $props();

	let thumbnail = $derived(
		video.thumbnails.medium?.url ||
			video.thumbnails.high?.url ||
			video.thumbnails.default?.url ||
			''
	);

	let duration = $derived(formatDuration(video.duration));
	let views = $derived(formatViewCount(video.viewCount));
	let age = $derived(formatRelativeTime(video.publishedAt));
</script>

<a href="/watch/{video.id}" class="video-card {layout}" data-sveltekit-preload-data="hover">
	<div class="thumbnail-container">
		<img
			src={thumbnail}
			alt={video.title}
			class="thumbnail"
			loading="lazy"
			decoding="async"
			width="480"
			height="270"
		/>
		{#if duration}
			<span class="duration-badge">{duration}</span>
		{/if}
	</div>
	<div class="video-info">
		<div class="channel-avatar-placeholder">
			<div class="avatar-circle">{video.channelTitle.charAt(0).toUpperCase()}</div>
		</div>
		<div class="video-details">
			<h3 class="video-title line-clamp-2">{video.title}</h3>
			<div class="channel-name">{video.channelTitle}</div>
			<div class="video-meta">
				<span>{views}</span>
				<span class="meta-dot">&middot;</span>
				<span>{age}</span>
			</div>
		</div>
	</div>
</a>

<style>
	.video-card {
		display: block;
		text-decoration: none;
		color: var(--text-primary);
		border-radius: 12px;
		transition: background-color 0.15s;
		cursor: pointer;
		content-visibility: auto;
		contain-intrinsic-size: auto 300px;
	}

	.video-card:hover {
		text-decoration: none;
	}

	.thumbnail-container {
		position: relative;
		width: 100%;
		aspect-ratio: 16/9;
		border-radius: 12px;
		overflow: hidden;
		background: var(--skeleton-bg);
	}

	.thumbnail {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.duration-badge {
		position: absolute;
		bottom: 4px;
		right: 4px;
		background: rgba(0, 0, 0, 0.8);
		color: #fff;
		font-size: 12px;
		font-weight: 500;
		padding: 1px 4px;
		border-radius: 4px;
		line-height: 1.4;
	}

	.video-info {
		display: flex;
		gap: 12px;
		padding: 12px 0 24px;
	}

	.channel-avatar-placeholder {
		flex-shrink: 0;
	}

	.avatar-circle {
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

	.video-details {
		flex: 1;
		min-width: 0;
	}

	.video-title {
		font-size: 14px;
		font-weight: 500;
		line-height: 1.4;
		margin-bottom: 4px;
	}

	.channel-name {
		font-size: 12px;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.channel-name:hover {
		color: var(--text-primary);
	}

	.video-meta {
		font-size: 12px;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.meta-dot {
		font-size: 10px;
	}

	/* List layout (search results) */
	.video-card.list {
		display: flex;
		gap: 16px;
	}

	.list .thumbnail-container {
		width: 360px;
		flex-shrink: 0;
	}

	.list .video-info {
		padding: 0;
		flex-direction: column;
		gap: 0;
	}

	.list .channel-avatar-placeholder {
		display: none;
	}

	.list .video-title {
		font-size: 18px;
		margin-bottom: 8px;
	}

	.list .channel-name {
		font-size: 12px;
		margin-bottom: 4px;
	}

	/* Compact layout (related videos) */
	.video-card.compact {
		display: flex;
		gap: 8px;
	}

	.compact .thumbnail-container {
		width: 168px;
		flex-shrink: 0;
		border-radius: 8px;
	}

	.compact .video-info {
		padding: 0;
		flex-direction: column;
		gap: 0;
	}

	.compact .channel-avatar-placeholder {
		display: none;
	}

	.compact .video-title {
		font-size: 14px;
		margin-bottom: 4px;
	}

	.compact .channel-name {
		font-size: 12px;
	}

	@media (max-width: 768px) {
		.video-card.list {
			flex-direction: column;
		}

		.list .thumbnail-container {
			width: 100%;
		}

		.list .video-title {
			font-size: 14px;
		}
	}
</style>
