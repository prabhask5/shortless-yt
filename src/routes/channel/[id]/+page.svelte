<!--
	@component Channel Page

	Displays a channel's banner and profile immediately (blocking data),
	then streams in videos and subscription status with skeleton placeholders.
	Videos support infinite scroll pagination.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import FilterChips from '$lib/components/FilterChips.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { useColumns } from '$lib/stores/columns.svelte';
	import { goto } from '$app/navigation';
	import type { VideoItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cols = useColumns();
	let showAboutModal = $state(false);

	/* ── Infinite scroll state ── */
	let allVideos = $state<VideoItem[]>([]);
	let nextPageToken = $state<string | undefined>(undefined);
	let loadingMore = $state(false);

	$effect(() => {
		data.streamed.channelData.then((channelData) => {
			allVideos = channelData.videos;
			nextPageToken = channelData.nextPageToken;
		});
	});

	async function loadMore() {
		if (!nextPageToken || loadingMore) return;
		loadingMore = true;
		try {
			const params = new URLSearchParams({
				source: 'channel',
				pageToken: nextPageToken,
				channelId: data.channel.id
			});
			const res = await fetch(`/api/videos?${params}`);
			const json = await res.json();
			allVideos = [...allVideos, ...json.items];
			nextPageToken = json.nextPageToken;
		} finally {
			loadingMore = false;
		}
	}

	$effect(() => {
		if (showAboutModal) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

	function formatCount(count: string): string {
		const n = parseInt(count, 10);
		if (isNaN(n)) return count;
		if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
		return `${n}`;
	}

	function formatFullCount(count: string): string {
		const n = parseInt(count, 10);
		if (isNaN(n)) return count;
		return n.toLocaleString();
	}

	function formatJoinDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch {
			return iso;
		}
	}

	const sortFilters = [
		{ label: 'Recent', value: 'recent' },
		{ label: 'Oldest', value: 'oldest' },
		{ label: 'Popular', value: 'popular' }
	];

	function handleSortChange(value: string | string[]) {
		const sort = Array.isArray(value) ? value[0] : value;
		goto(`/channel/${data.channel.id}?sort=${sort}`);
	}
</script>

<svelte:head>
	<title>{data.channel.title} - Shortless YouTube</title>
</svelte:head>

<div class="mx-auto max-w-screen-2xl">
	<!-- Channel banner (blocking data — renders immediately) -->
	{#if data.channel.bannerUrl}
		<div class="aspect-[6.2/1] w-full overflow-hidden">
			<img
				src="{data.channel.bannerUrl}=w1707-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj"
				alt="{data.channel.title} banner"
				class="h-full w-full object-cover"
			/>
		</div>
	{:else}
		<div class="bg-yt-surface aspect-[6.2/1] w-full"></div>
	{/if}

	<!-- Channel profile header -->
	<div class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:py-6">
		<img
			src={data.channel.thumbnailUrl}
			alt={data.channel.title}
			class="h-16 w-16 shrink-0 rounded-full sm:h-20 sm:w-20"
		/>
		<div class="min-w-0 flex-1">
			<h1 class="text-yt-text truncate text-lg font-bold sm:text-2xl">
				{data.channel.title}
			</h1>
			<p class="text-yt-text-secondary mt-0.5 text-xs sm:text-sm">
				{formatCount(data.channel.subscriberCount)} subscribers &middot;
				{formatCount(data.channel.videoCount)} videos
			</p>
			{#if data.channel.description}
				<div class="mt-1 flex items-center gap-1">
					<p class="text-yt-text-secondary line-clamp-1 text-xs sm:text-sm">
						{data.channel.description}
					</p>
					<button
						onclick={() => (showAboutModal = true)}
						class="text-yt-text-secondary hover:text-yt-text shrink-0 text-xs font-medium sm:text-sm"
					>
						...more
					</button>
				</div>
			{/if}
			<!-- Subscription badge streams in -->
			{#await data.streamed.channelData then channelData}
				{#if channelData.isSubscribed}
					<span
						class="bg-yt-surface text-yt-text-secondary mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
					>
						<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
							<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
						</svg>
						Subscribed
					</span>
				{/if}
			{/await}
		</div>
	</div>

	<!-- Sort chips + Videos grid -->
	<div class="px-4 pb-8">
		<div class="mb-3 flex items-center justify-between sm:mb-4">
			<h2 class="text-yt-text text-base font-medium sm:text-lg">Videos</h2>
		</div>
		<FilterChips filters={sortFilters} selected={data.sort} onChange={handleSortChange} />
		<div class="mt-3 sm:mt-4">
			{#await data.streamed.channelData}
				<!-- Video grid skeletons -->
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{#each Array(8) as _unused, i (i)}
						<Skeleton variant="video-card" />
					{/each}
				</div>
			{:then _channelData}
				{#if allVideos.length > 0}
					<VirtualFeed
						items={allVideos}
						columns={cols.value}
						gap={16}
						hasMore={!!nextPageToken}
						{loadingMore}
						onLoadMore={loadMore}
					>
						{#snippet children(video)}
							<VideoCard {video} />
						{/snippet}
					</VirtualFeed>
				{:else}
					<p class="text-yt-text-secondary py-8 text-center">No videos found.</p>
				{/if}
			{:catch}
				<p class="text-yt-text-secondary py-8 text-center">Failed to load videos.</p>
			{/await}
		</div>
	</div>
</div>

<!-- About channel modal -->
{#if showAboutModal}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
		role="dialog"
		aria-modal="true"
		aria-label="About {data.channel.title}"
	>
		<button
			class="absolute inset-0 bg-black/60"
			onclick={() => (showAboutModal = false)}
			aria-label="Close"
			tabindex="-1"
		></button>
		<div
			class="bg-yt-bg relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl p-4 sm:max-w-lg sm:rounded-2xl sm:p-6"
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-yt-text text-lg font-bold">About</h2>
				<button
					onclick={() => (showAboutModal = false)}
					class="text-yt-text-secondary hover:text-yt-text flex h-8 w-8 items-center justify-center rounded-full"
					aria-label="Close"
				>
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
						<path
							d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
						/>
					</svg>
				</button>
			</div>
			{#if data.channel.description}
				<p class="text-yt-text text-sm leading-relaxed whitespace-pre-line">
					{data.channel.description}
				</p>
			{:else}
				<p class="text-yt-text-secondary text-sm italic">No description available.</p>
			{/if}
			<div class="border-yt-border mt-4 border-t pt-4">
				<h3 class="text-yt-text mb-3 text-sm font-semibold">Stats</h3>
				<div class="space-y-2">
					{#if data.channel.publishedAt}
						<div class="flex items-center gap-3">
							<svg
								class="text-yt-text-secondary h-5 w-5 shrink-0"
								fill="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"
								/>
							</svg>
							<div>
								<p class="text-yt-text-secondary text-xs">Joined</p>
								<p class="text-yt-text text-sm">{formatJoinDate(data.channel.publishedAt)}</p>
							</div>
						</div>
					{/if}
					<div class="flex items-center gap-3">
						<svg
							class="text-yt-text-secondary h-5 w-5 shrink-0"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
							/>
						</svg>
						<div>
							<p class="text-yt-text-secondary text-xs">Views</p>
							<p class="text-yt-text text-sm">
								{data.channel.viewCount ? formatFullCount(data.channel.viewCount) : 'Hidden'}
							</p>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<svg
							class="text-yt-text-secondary h-5 w-5 shrink-0"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
							/>
						</svg>
						<div>
							<p class="text-yt-text-secondary text-xs">Subscribers</p>
							<p class="text-yt-text text-sm">{formatFullCount(data.channel.subscriberCount)}</p>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<svg
							class="text-yt-text-secondary h-5 w-5 shrink-0"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"
							/>
						</svg>
						<div>
							<p class="text-yt-text-secondary text-xs">Videos</p>
							<p class="text-yt-text text-sm">{formatFullCount(data.channel.videoCount)}</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
