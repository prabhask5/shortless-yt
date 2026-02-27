<!--
	@component Playlist Page

	Displays a playlist's metadata (thumbnail, title, channel, video count,
	description) alongside a numbered list of its videos.

	The numbered list pattern wraps each video in an object with a `number`
	field (1-indexed) so the VirtualFeed can render a track-number column
	next to horizontal video cards, similar to YouTube's playlist layout.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* Map videos to numbered entries for the track-number display column */
	let numberedVideos = $derived(data.videos.map((video, i) => ({ video, number: i + 1 })));
</script>

<svelte:head>
	<title>{data.playlist.title} - Shortless YouTube</title>
</svelte:head>

<div class="mx-auto max-w-screen-xl px-4 py-4">
	<div class="mb-6">
		<div class="flex items-start gap-4">
			<img
				src={data.playlist.thumbnailUrl}
				alt={data.playlist.title}
				class="w-40 rounded-lg sm:w-60"
			/>
			<div>
				<h1 class="text-xl font-bold sm:text-2xl">{data.playlist.title}</h1>
				<p class="text-yt-text-secondary text-sm">{data.playlist.channelTitle}</p>
				<p class="text-yt-text-secondary text-sm">{data.playlist.itemCount} videos</p>
				{#if data.playlist.description}
					<p class="text-yt-text-secondary mt-2 line-clamp-3 text-sm">
						{data.playlist.description}
					</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Single-column VirtualFeed with numbered entries resembling YouTube's playlist view -->
	<VirtualFeed items={numberedVideos} columns={1} gap={12}>
		{#snippet children(entry)}
			<div class="flex items-center gap-3">
				<!-- Track number column -->
				<span class="text-yt-text-secondary w-8 text-center text-sm">{entry.number}</span>
				<div class="flex-1">
					<VideoCard video={entry.video} layout="horizontal" />
				</div>
			</div>
		{/snippet}
	</VirtualFeed>
</div>
