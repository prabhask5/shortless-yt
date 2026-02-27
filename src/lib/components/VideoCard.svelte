<script lang="ts">
	import type { VideoItem } from '$lib/types';

	let { video, layout = 'vertical' }: { video: VideoItem; layout?: 'vertical' | 'horizontal' } =
		$props();

	function parseDuration(iso: string): string {
		const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
		if (!match) return '0:00';
		const h = match[1] ? parseInt(match[1]) : 0;
		const m = match[2] ? parseInt(match[2]) : 0;
		const s = match[3] ? parseInt(match[3]) : 0;
		if (h > 0) {
			return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
		}
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function formatViewCount(count: string): string {
		const n = parseInt(count);
		if (isNaN(n)) return count;
		if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B views`;
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K views`;
		return `${n} views`;
	}

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

	let duration = $derived(parseDuration(video.duration));
	let views = $derived(formatViewCount(video.viewCount));
	let timeAgo = $derived(formatTimeAgo(video.publishedAt));
	let isLive = $derived(video.liveBroadcastContent === 'live');
</script>

<div
	class="group flex gap-2"
	class:flex-col={layout === 'vertical'}
	class:flex-row={layout === 'horizontal'}
>
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
