<script lang="ts">
	import type { VideoItem } from '$lib/types';
	import { formatViewCount, formatDate, formatLikeCount } from '$lib/utils/format';

	interface Props {
		video: VideoItem;
		onPremiumHelp?: () => void;
	}

	let { video, onPremiumHelp }: Props = $props();
</script>

<div class="video-meta">
	<h1 class="video-title">{video.title}</h1>
	<div class="meta-bar">
		<div class="meta-info">
			<div class="channel-row">
				<div class="channel-avatar">
					{video.channelTitle.charAt(0).toUpperCase()}
				</div>
				<div class="channel-info">
					<span class="channel-name">{video.channelTitle}</span>
				</div>
			</div>
		</div>
		<div class="meta-actions">
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
