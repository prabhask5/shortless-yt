<script lang="ts">
	import type { ChannelItem } from '$lib/types';

	let { channel }: { channel: ChannelItem } = $props();

	function formatCount(count: string): string {
		const n = parseInt(count);
		if (isNaN(n)) return count;
		if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
		return `${n}`;
	}

	let subscribers = $derived(formatCount(channel.subscriberCount));
	let videos = $derived(formatCount(channel.videoCount));
</script>

<a
	href="/channel/{channel.id}"
	class="hover:bg-yt-surface-hover flex items-center gap-4 rounded-xl p-3"
>
	<img
		src={channel.thumbnailUrl}
		alt={channel.title}
		class="h-20 w-20 shrink-0 rounded-full object-cover md:h-28 md:w-28"
		loading="lazy"
	/>

	<div class="min-w-0 flex-1">
		<h3 class="text-yt-text truncate text-base font-medium md:text-lg">
			{channel.title}
		</h3>
		<div class="text-yt-text-secondary mt-1 text-xs md:text-sm">
			<span>{subscribers} subscribers</span>
			<span class="mx-1">&middot;</span>
			<span>{videos} videos</span>
		</div>
		{#if channel.description}
			<p class="text-yt-text-secondary mt-1 line-clamp-2 text-xs">
				{channel.description}
			</p>
		{/if}
	</div>
</a>
