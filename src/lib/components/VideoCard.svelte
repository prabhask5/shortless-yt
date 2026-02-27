<script lang="ts">
	/**
	 * @fileoverview VideoCard component for displaying a single video in a feed or search result.
	 * @component
	 *
	 * Renders a video thumbnail with metadata (title, channel, view count, publish time).
	 * Supports two layout modes:
	 * - "vertical" (default): thumbnail on top, metadata below -- used in grid feeds.
	 * - "horizontal": thumbnail on the left, metadata on the right -- used in search results
	 *   and sidebar suggestions.
	 *
	 * The duration badge overlays the thumbnail. Live broadcasts show a red "LIVE" badge instead.
	 */
	import type { VideoItem } from '$lib/types';

	/** @prop video - The video data object containing all metadata fields */
	/** @prop layout - Controls card orientation: 'vertical' for grid feeds, 'horizontal' for lists */
	let { video, layout = 'vertical' }: { video: VideoItem; layout?: 'vertical' | 'horizontal' } =
		$props();

	/**
	 * Converts an ISO 8601 duration string (e.g., "PT1H23M45S") into a human-readable
	 * timestamp format (e.g., "1:23:45"). The YouTube Data API returns durations in this
	 * ISO format, so we parse the optional H/M/S groups via regex.
	 * @param iso - ISO 8601 duration string from the YouTube API
	 * @returns Formatted duration string like "1:23:45" or "3:07"
	 */
	function parseDuration(iso: string): string {
		const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
		if (!match) return '0:00';
		const h = match[1] ? parseInt(match[1]) : 0;
		const m = match[2] ? parseInt(match[2]) : 0;
		const s = match[3] ? parseInt(match[3]) : 0;
		/* Only show the hours segment when the video is 1+ hour long */
		if (h > 0) {
			return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
		}
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	/**
	 * Abbreviates a raw view count string into a compact human-readable form.
	 * Uses B/M/K suffixes and strips trailing ".0" for cleaner display (e.g., "1M" not "1.0M").
	 * @param count - Raw view count string from the API
	 * @returns Formatted string like "1.2M views" or "843K views"
	 */
	function formatViewCount(count: string): string {
		const n = parseInt(count);
		if (isNaN(n)) return count;
		if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B views`;
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K views`;
		return `${n} views`;
	}

	/**
	 * Converts a date string into a relative "time ago" label (e.g., "3 days ago").
	 * Cascades through progressively larger time units, using approximate month (30d)
	 * and year (365d) lengths for simplicity.
	 * @param dateStr - ISO date string from the API (e.g., "2024-01-15T12:00:00Z")
	 * @returns Relative time string like "2 hours ago" or "3 months ago"
	 */
	function formatTimeAgo(dateStr: string): string {
		const now = Date.now();
		const then = new Date(dateStr).getTime();
		const seconds = Math.floor((now - then) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
		const weeks = Math.floor(days / 7);
		if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
		const months = Math.floor(days / 30);
		if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
		const years = Math.floor(days / 365);
		return `${years} year${years !== 1 ? 's' : ''} ago`;
	}

	/* Derived values recompute automatically when the video prop changes */
	let duration = $derived(parseDuration(video.duration));
	let views = $derived(formatViewCount(video.viewCount));
	let timeAgo = $derived(formatTimeAgo(video.publishedAt));
	let isLive = $derived(video.liveBroadcastContent === 'live');
</script>

<!-- Card container: switches between column (vertical) and row (horizontal) flex direction.
     The "group" class enables group-hover effects on child elements (e.g., thumbnail scale). -->
<div
	class="group flex gap-2"
	class:flex-col={layout === 'vertical'}
	class:flex-row={layout === 'horizontal'}
>
	<!-- Thumbnail link: in vertical layout it fills the width with aspect-video ratio;
	     in horizontal layout it has a fixed width (w-40 / sm:w-60) for the sidebar style. -->
	<a
		href="/watch?v={video.id}"
		class="relative block overflow-hidden rounded-xl"
		class:aspect-video={layout === 'vertical'}
		class:w-40={layout === 'horizontal'}
		class:shrink-0={layout === 'horizontal'}
		class:sm:w-60={layout === 'horizontal'}
	>
		<img
			src={video.thumbnailUrl}
			alt={video.title}
			class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
			loading="lazy"
		/>
		<!-- Duration/Live badge: overlaid on the bottom-right of the thumbnail -->
		{#if isLive}
			<span
				class="bg-yt-accent absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-xs font-medium text-white"
			>
				LIVE
			</span>
		{:else if duration}
			<span
				class="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white"
			>
				{duration}
			</span>
		{/if}
	</a>

	<!-- Metadata section: channel avatar + title + stats -->
	<div class="flex gap-3">
		{#if video.channelAvatarUrl}
			<a href="/channel/{video.channelId}" class="mt-0.5 shrink-0">
				<img
					src={video.channelAvatarUrl}
					alt={video.channelTitle}
					class="h-9 w-9 rounded-full"
					loading="lazy"
				/>
			</a>
		{/if}

		<div class="min-w-0 flex-1">
			<a href="/watch?v={video.id}">
				<h3 class="text-yt-text line-clamp-2 text-sm font-medium">
					{video.title}
				</h3>
			</a>
			<div class="text-yt-text-secondary mt-1 text-xs">
				<a href="/channel/{video.channelId}" class="hover:text-yt-text">
					{video.channelTitle}
				</a>
				<span class="mx-1">&middot;</span>
				<span>{views}</span>
				<span class="mx-1">&middot;</span>
				<span>{timeAgo}</span>
			</div>
		</div>
	</div>
</div>
