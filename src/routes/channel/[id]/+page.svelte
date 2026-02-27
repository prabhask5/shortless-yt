<!--
	@component Channel Page

	Displays a channel's profile (avatar, title, subscriber/video counts,
	description) followed by a responsive video grid of the channel's uploads.

	The column count adapts to viewport width using the same breakpoint logic
	as the home page. When there are no videos (or while loading), skeleton
	placeholders are shown to prevent layout shift.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let columns = $state(1);

	/* Responsive column calculation matching the home page breakpoints */
	$effect(() => {
		function updateColumns() {
			const w = window.innerWidth;
			if (w >= 1280) columns = 4;
			else if (w >= 1024) columns = 3;
			else if (w >= 640) columns = 2;
			else columns = 1;
		}
		updateColumns();
		window.addEventListener('resize', updateColumns);
		return () => window.removeEventListener('resize', updateColumns);
	});

	/* Abbreviate large numbers for display (e.g. 1500000 -> "1.5M") */
	function formatCount(count: string): string {
		const n = parseInt(count, 10);
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return count;
	}
</script>

<svelte:head>
	<title>{data.channel.title} - Shortless YouTube</title>
</svelte:head>

<div class="mx-auto max-w-screen-2xl">
	<!-- Channel profile header: avatar, name, stats, and truncated description -->
	<div class="flex items-center gap-4 px-4 py-6">
		<img src={data.channel.thumbnailUrl} alt={data.channel.title} class="h-20 w-20 rounded-full" />
		<div>
			<h1 class="text-2xl font-bold">{data.channel.title}</h1>
			<p class="text-yt-text-secondary text-sm">
				{formatCount(data.channel.subscriberCount)} subscribers &middot;
				{formatCount(data.channel.videoCount)} videos
			</p>
			{#if data.channel.description}
				<p class="text-yt-text-secondary mt-1 line-clamp-2 text-sm">
					{data.channel.description}
				</p>
			{/if}
		</div>
	</div>

	<!-- Channel videos grid: VirtualFeed for performance, skeletons as fallback -->
	<div class="px-4 pb-8">
		<h2 class="mb-4 text-lg font-medium">Videos</h2>
		{#if data.videos.length > 0}
			<VirtualFeed
				items={data.videos}
				{columns}
				estimateRowHeight={columns === 1 ? 300 : 280}
				gap={16}
			>
				{#snippet children(video)}
					<VideoCard {video} />
				{/snippet}
			</VirtualFeed>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{#each Array(8) as _unused, i (i)}
					<Skeleton variant="video-card" />
				{/each}
			</div>
		{/if}
	</div>
</div>
