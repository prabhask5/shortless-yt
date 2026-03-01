<!--
	@component Watch Page

	Renders the video player immediately (blocking data), then streams in
	channel details, related videos, and comments with skeleton placeholders.
-->
<script lang="ts">
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import VideoDetails from '$lib/components/VideoDetails.svelte';
	import VideoChapters from '$lib/components/VideoChapters.svelte';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { CommentItem, VideoItem } from '$lib/types';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	let playerStartTime = $state(data.startTime);

	let theaterMode = $state(false);
	onMount(() => {
		theaterMode = localStorage.getItem('theaterMode') === 'true';
	});
	function toggleTheater() {
		theaterMode = !theaterMode;
		localStorage.setItem('theaterMode', String(theaterMode));
	}

	function handleSeek(seconds: number) {
		playerStartTime = seconds;
	}

	/** Client-side comment pagination state — initialized when streamed data resolves */
	let comments = $state<CommentItem[]>([]);
	let commentsNextPageToken = $state<string | undefined>(undefined);
	let loadingMoreComments = $state(false);

	/** Related videos (more from this channel) pagination state */
	let relatedVideos = $state<VideoItem[]>([]);
	let relatedNextPageToken = $state<string | undefined>(undefined);
	let loadingMoreRelated = $state(false);
	/** Channel ID for related video pagination */
	let relatedChannelId = $state<string>('');

	let sidebarGeneration = 0;

	$effect(() => {
		if (data.streamed?.sidebarData) {
			const gen = ++sidebarGeneration;
			data.streamed.sidebarData.then((sidebar) => {
				if (gen !== sidebarGeneration) return;
				comments = sidebar.comments;
				commentsNextPageToken = sidebar.commentsNextPageToken;
				relatedVideos = sidebar.relatedVideos;
				relatedNextPageToken = sidebar.relatedNextPageToken;
				relatedChannelId = data.video.channelId;
			});
		}
	});

	async function loadMoreComments() {
		if (!commentsNextPageToken || loadingMoreComments) return;
		loadingMoreComments = true;
		try {
			const res = await fetch(
				`/api/comments?videoId=${encodeURIComponent(data.video.id)}&pageToken=${encodeURIComponent(commentsNextPageToken)}`
			);
			if (res.ok) {
				const result = (await res.json()) as {
					comments: CommentItem[];
					nextPageToken?: string;
				};
				comments.push(...result.comments);
				commentsNextPageToken = result.nextPageToken;
			}
		} finally {
			loadingMoreComments = false;
		}
	}

	async function loadMoreRelated() {
		if (!relatedNextPageToken || loadingMoreRelated || !relatedChannelId) return;
		loadingMoreRelated = true;
		try {
			const params = new URLSearchParams({
				source: 'channel',
				pageToken: relatedNextPageToken,
				channelId: relatedChannelId
			});
			const res = await fetch(`/api/videos?${params}`);
			if (res.ok) {
				const json = (await res.json()) as { items: VideoItem[]; nextPageToken?: string };
				const filtered = json.items.filter((v) => v.id !== data.video.id);
				relatedVideos.push(...filtered);
				relatedNextPageToken = json.nextPageToken;
			}
		} finally {
			loadingMoreRelated = false;
		}
	}
</script>

<svelte:head>
	<title>{data.video.title} - Shortless YouTube</title>
	<meta name="description" content={data.video.title} />
</svelte:head>

<div class="mx-auto px-4 py-4 {theaterMode ? 'max-w-full' : 'max-w-screen-xl'}">
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<div class={theaterMode ? 'lg:col-span-3' : 'lg:col-span-2'}>
			<!-- Video player renders immediately (blocking data) — keyed to force
				 iframe recreation on navigation so autoplay triggers reliably -->
			{#key data.video.id}
				<VideoPlayer videoId={data.video.id} startTime={playerStartTime} />
			{/key}

			<!-- Theater mode toggle (desktop only) -->
			<div class="mt-2 hidden justify-end lg:flex">
				<button
					onclick={toggleTheater}
					class="bg-yt-surface text-yt-text flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:brightness-125"
					aria-label={theaterMode ? 'Exit theater mode' : 'Enter theater mode'}
				>
					{#if theaterMode}
						<svg
							class="h-5 w-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="4 14 10 14 10 20" />
							<polyline points="20 10 14 10 14 4" />
							<line x1="14" y1="10" x2="21" y2="3" />
							<line x1="3" y1="21" x2="10" y2="14" />
						</svg>
					{:else}
						<svg
							class="h-5 w-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="15 3 21 3 21 9" />
							<polyline points="9 21 3 21 3 15" />
							<line x1="21" y1="3" x2="14" y2="10" />
							<line x1="3" y1="21" x2="10" y2="14" />
						</svg>
					{/if}
				</button>
			</div>

			<!-- Channel details + comments stream in -->
			{#await data.streamed.sidebarData}
				<!-- Skeleton for video details -->
				<div class="mt-4 space-y-3">
					<div class="bg-yt-surface h-6 w-3/4 animate-pulse rounded"></div>
					<div class="flex items-center gap-3">
						<div class="bg-yt-surface h-10 w-10 animate-pulse rounded-full"></div>
						<div class="space-y-1">
							<div class="bg-yt-surface h-4 w-32 animate-pulse rounded"></div>
							<div class="bg-yt-surface h-3 w-20 animate-pulse rounded"></div>
						</div>
					</div>
					<div class="bg-yt-surface h-20 w-full animate-pulse rounded-xl"></div>
				</div>
				<!-- Skeleton for comments -->
				<div class="mt-6 space-y-4">
					{#each Array(4) as _unused, i (i)}
						<Skeleton variant="comment" />
					{/each}
				</div>
			{:then sidebar}
				<VideoDetails
					title={data.video.title}
					viewCount={data.video.viewCount}
					publishedAt={data.video.publishedAt}
					channelId={data.video.channelId}
					channelTitle={data.video.channelTitle}
					channelAvatarUrl={sidebar.channel?.thumbnailUrl}
					subscriberCount={sidebar.channel?.subscriberCount}
					description={data.video.description ?? ''}
					likeCount={data.video.likeCount ?? ''}
				/>

				{#if data.video.description}
					<VideoChapters description={data.video.description} onSeek={handleSeek} />
				{/if}

				<CommentSection
					{comments}
					loading={loadingMoreComments}
					onLoadMore={loadMoreComments}
					hasMore={!!commentsNextPageToken}
				/>
			{:catch}
				<VideoDetails
					title={data.video.title}
					viewCount={data.video.viewCount}
					publishedAt={data.video.publishedAt}
					channelId={data.video.channelId}
					channelTitle={data.video.channelTitle}
					description={data.video.description ?? ''}
					likeCount={data.video.likeCount ?? ''}
				/>
			{/await}
		</div>

		<!-- More from this channel sidebar -->
		{#await data.streamed.sidebarData}
			<aside class="flex flex-col gap-3 {theaterMode ? 'lg:col-span-3' : ''}">
				<div class="bg-yt-surface h-5 w-48 animate-pulse rounded"></div>
				{#each Array(5) as _unused, i (i)}
					<div class="flex gap-3">
						<div class="bg-yt-surface h-20 w-36 shrink-0 animate-pulse rounded-lg"></div>
						<div class="flex-1 space-y-2">
							<div class="bg-yt-surface h-4 w-full animate-pulse rounded"></div>
							<div class="bg-yt-surface h-3 w-24 animate-pulse rounded"></div>
							<div class="bg-yt-surface h-3 w-16 animate-pulse rounded"></div>
						</div>
					</div>
				{/each}
			</aside>
		{:then _sidebar}
			{#if relatedVideos.length > 0}
				<aside class="flex flex-col gap-3 {theaterMode ? 'lg:col-span-3' : ''}">
					<h2 class="text-yt-text text-base font-medium">More from this channel</h2>
					<VirtualFeed
						items={relatedVideos}
						columns={1}
						gap={12}
						hasMore={!!relatedNextPageToken}
						loadingMore={loadingMoreRelated}
						onLoadMore={loadMoreRelated}
					>
						{#snippet children(video)}
							<VideoCard {video} layout="horizontal" />
						{/snippet}
					</VirtualFeed>
				</aside>
			{/if}
		{:catch}
			<!-- Silently omit sidebar on error -->
		{/await}
	</div>
</div>
