<script lang="ts">
	/**
	 * VideoCard.svelte
	 *
	 * Renders a single video as a clickable card. Supports three visual layouts:
	 *   - "grid": default card layout for the home page / channel page (thumbnail on top, info below)
	 *   - "list": horizontal layout used in search results (thumbnail left, details right)
	 *   - "compact": small horizontal layout used in the related-videos sidebar
	 *
	 * The entire card is an <a> link to the watch page. The channel avatar and
	 * channel name are interactive sub-elements that navigate to the channel page
	 * without following the outer link.
	 */

	import { goto } from '$app/navigation';
	import type { VideoItem } from '$lib/types';
	import { formatViewCount, formatDuration, formatRelativeTime } from '$lib/utils/format';

	interface Props {
		/** The video data object containing title, thumbnails, channel info, stats, etc. */
		video: VideoItem;
		/** Visual layout variant. Defaults to 'grid'. */
		layout?: 'grid' | 'list' | 'compact';
	}

	/** Destructure props with Svelte 5 $props() rune; layout defaults to 'grid' */
	let { video, layout = 'grid' }: Props = $props();

	/**
	 * $derived rune: automatically recomputes the best available thumbnail URL
	 * whenever the `video` prop changes. Prefers medium > high > default resolution
	 * to balance quality vs. file size for card-level display.
	 */
	let thumbnail = $derived(
		video.thumbnails.medium?.url ||
			video.thumbnails.high?.url ||
			video.thumbnails.default?.url ||
			''
	);

	/** $derived rune: formatted video duration string (e.g. "12:34"), recalculated when video changes */
	let duration = $derived(formatDuration(video.duration));
	/** $derived rune: human-readable view count (e.g. "1.2M views"), recalculated when video changes */
	let views = $derived(formatViewCount(video.viewCount));
	/** $derived rune: relative time since publish (e.g. "3 days ago"), recalculated when video changes */
	let age = $derived(formatRelativeTime(video.publishedAt));

	/**
	 * Navigates to the channel page when the user clicks or presses Enter on
	 * the channel avatar or channel name. Uses preventDefault + stopPropagation
	 * so the outer <a> link (to the watch page) is not triggered.
	 * @param e - The mouse click or keyboard event
	 */
	function goToChannel(e: MouseEvent | KeyboardEvent) {
		// Only respond to Enter key presses for keyboard events (ignore Tab, Space, etc.)
		if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
		e.preventDefault();
		e.stopPropagation();
		goto(`/channel/${video.channelId}`);
	}
</script>

<!-- Entire card is wrapped in an <a> tag linking to the watch page.
     data-sveltekit-preload-data="tap" triggers SvelteKit data preloading on pointer down. -->
<a href="/watch/{video.id}" class="video-card {layout}" data-sveltekit-preload-data="tap">
	<div class="thumbnail-container">
		<!-- Lazy-loaded thumbnail with explicit dimensions to prevent layout shift -->
		<img
			src={thumbnail}
			alt={video.title}
			class="thumbnail"
			loading="lazy"
			decoding="async"
			width="480"
			height="270"
		/>
		<!-- Duration badge is only shown if the video has a parseable duration (e.g. not a live stream) -->
		{#if duration}
			<span class="duration-badge">{duration}</span>
		{/if}
	</div>
	<div class="video-info">
		<!-- Channel avatar: uses role="link" + tabindex to act as a nested interactive element.
		     onclick/onkeydown call goToChannel which stops propagation to prevent the outer <a> from firing. -->
		<span
			class="channel-avatar-placeholder"
			role="link"
			tabindex="0"
			onclick={goToChannel}
			onkeydown={goToChannel}
		>
			{#if video.channelThumbnail}
				<!-- referrerpolicy="no-referrer" avoids sending our origin to Google's image CDN -->
				<img
					src={video.channelThumbnail}
					alt={video.channelTitle}
					class="avatar-img"
					loading="lazy"
					decoding="async"
					width="36"
					height="36"
					referrerpolicy="no-referrer"
				/>
			{:else}
				<!-- Fallback: show the first letter of the channel name in a colored circle -->
				<div class="avatar-circle">{video.channelTitle.charAt(0).toUpperCase()}</div>
			{/if}
		</span>
		<div class="video-details">
			<!-- line-clamp-2 (global utility class) truncates the title to 2 lines with ellipsis -->
			<h3 class="video-title line-clamp-2">{video.title}</h3>
			<!-- Channel name is also a nested interactive element navigating to the channel page -->
			<span
				class="channel-name"
				role="link"
				tabindex="0"
				onclick={goToChannel}
				onkeydown={goToChannel}>{video.channelTitle}</span
			>
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
		contain: layout style;
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
		cursor: pointer;
	}

	.avatar-img {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
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
