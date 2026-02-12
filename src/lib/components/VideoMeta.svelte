<script lang="ts">
	/**
	 * VideoMeta.svelte
	 *
	 * Displays the metadata section below the video player on the watch page.
	 * Includes: video title, channel avatar/name link, like count chip,
	 * formatted view count, publish date, and an optional "Premium not applying?" help button.
	 *
	 * This is a presentational component with no internal state -- all data
	 * comes from the `video` prop and is formatted via utility functions.
	 */

	import type { VideoItem } from '$lib/types';
	import { formatViewCount, formatDate, formatLikeCount } from '$lib/utils/format';

	interface Props {
		/** The full video data object (title, channel info, stats, timestamps, etc.) */
		video: VideoItem;
		/** Optional callback invoked when the user clicks the "Premium not applying?" link.
		 *  When undefined, the link is not rendered. */
		onPremiumHelp?: () => void;
	}

	/** Destructure props with Svelte 5 $props() rune */
	let { video, onPremiumHelp }: Props = $props();
</script>

<!-- Video metadata section displayed below the player on the watch page -->
<div class="video-meta">
	<h1 class="video-title">{video.title}</h1>
	<!-- meta-bar: flex row with channel info on the left, action chips/stats on the right.
	     Wraps on narrow screens via flex-wrap. -->
	<div class="meta-bar">
		<div class="meta-info">
			<div class="channel-row">
				<!-- Channel avatar links to the channel page -->
				<a href="/channel/{video.channelId}" class="channel-avatar-link">
					{#if video.channelThumbnail}
						<img
							src={video.channelThumbnail}
							alt={video.channelTitle}
							class="channel-avatar-img"
							loading="lazy"
							decoding="async"
							width="40"
							height="40"
							referrerpolicy="no-referrer"
						/>
					{:else}
						<!-- Fallback avatar: first letter of the channel name -->
						<div class="channel-avatar">
							{video.channelTitle.charAt(0).toUpperCase()}
						</div>
					{/if}
				</a>
				<div class="channel-info">
					<a href="/channel/{video.channelId}" class="channel-name">{video.channelTitle}</a>
				</div>
			</div>
		</div>
		<!-- Right side: like count pill, view count, publish date, and optional premium help link -->
		<div class="meta-actions">
			<!-- Like count displayed as a chip/pill with a thumbs-up SVG icon -->
			<div class="action-chip">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
					/>
				</svg>
				<span>{formatLikeCount(video.likeCount)}</span>
			</div>
			<div class="stat-text">{formatViewCount(video.viewCount)}</div>
			<div class="stat-text">{formatDate(video.publishedAt)}</div>
			<!-- Premium help link only renders when the parent provides the callback -->
			{#if onPremiumHelp}
				<button class="premium-link" onclick={onPremiumHelp}> Premium not applying? </button>
			{/if}
		</div>
	</div>
</div>

<style>
	.video-meta {
		padding: 12px 0;
	}

	.video-title {
		font-size: 20px;
		font-weight: 600;
		line-height: 1.4;
		margin-bottom: 12px;
	}

	.meta-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
	}

	.meta-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.channel-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.channel-avatar-link {
		flex-shrink: 0;
		text-decoration: none;
	}

	.channel-avatar-img {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
	}

	.channel-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--bg-tertiary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
		font-weight: 500;
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.channel-name {
		font-size: 16px;
		font-weight: 500;
		color: var(--text-primary);
		text-decoration: none;
	}

	.channel-name:hover {
		color: var(--text-primary);
	}

	.meta-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.action-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--bg-secondary);
		padding: 6px 16px;
		border-radius: 18px;
		font-size: 14px;
		font-weight: 500;
	}

	.stat-text {
		font-size: 14px;
		color: var(--text-secondary);
	}

	.premium-link {
		font-size: 12px;
		color: var(--text-link);
		padding: 4px 8px;
	}

	.premium-link:hover {
		text-decoration: underline;
	}

	@media (max-width: 768px) {
		.video-title {
			font-size: 16px;
		}

		.meta-bar {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
