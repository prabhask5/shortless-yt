<!--
	@component Watch Page

	Renders the video player, details, chapter markers, and comment section
	for a single video. Uses a two-column grid on desktop (player+details on
	the left, space for related content on the right).

	State management notes:
	- `playerStartTime` is initialized from server data (`data.startTime`) and
	  updated by the chapter seek handler. The `svelte-ignore state_referenced_locally`
	  directive is needed because we initialize $state() from a reactive prop --
	  Svelte warns about this pattern since the state will NOT re-sync if the prop
	  changes, but that is intentional here (we only want the initial value).
	- Comments are loaded in pages: the first page comes from the server load,
	  subsequent pages are fetched client-side via the `/api/comments` endpoint.
-->
<script lang="ts">
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import VideoDetails from '$lib/components/VideoDetails.svelte';
	import VideoChapters from '$lib/components/VideoChapters.svelte';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import type { CommentItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* Initial seek position from the `t` query param. Updated when the user
	 * clicks a chapter marker. svelte-ignore: we intentionally snapshot the
	 * server value once rather than keeping it reactive. */
	// svelte-ignore state_referenced_locally
	let playerStartTime = $state(data.startTime);

	// Called by VideoChapters when the user clicks a chapter timestamp
	function handleSeek(seconds: number) {
		playerStartTime = seconds;
	}

	/* Comment pagination state: seeded from server data, then extended
	 * client-side as the user clicks "load more". Same svelte-ignore
	 * rationale as playerStartTime above. */
	// svelte-ignore state_referenced_locally
	let comments = $state<CommentItem[]>(data.comments);
	// svelte-ignore state_referenced_locally
	let nextPageToken = $state(data.commentsNextPageToken);
	let loadingMoreComments = $state(false);

	/* Fetches the next page of comments from the server-side API proxy.
	 * Appends results to the existing array to create an infinite scroll effect. */
	async function loadMoreComments() {
		if (!nextPageToken || loadingMoreComments) return;
		loadingMoreComments = true;
		try {
			const res = await fetch(
				`/api/comments?videoId=${encodeURIComponent(data.video.id)}&pageToken=${encodeURIComponent(nextPageToken)}`
			);
			if (res.ok) {
				const result = (await res.json()) as {
					comments: CommentItem[];
					nextPageToken?: string;
				};
				comments = [...comments, ...result.comments];
				nextPageToken = result.nextPageToken;
			}
		} finally {
			loadingMoreComments = false;
		}
	}
</script>

<svelte:head>
	<title>{data.video.title} - Shortless YouTube</title>
	<meta name="description" content={data.video.title} />
</svelte:head>

<!-- Two-column layout: video content (2/3) + sidebar space (1/3) on large screens -->
<div class="mx-auto max-w-screen-xl px-4 py-4">
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<div class="lg:col-span-2">
			<VideoPlayer videoId={data.video.id} startTime={playerStartTime} />

			<VideoDetails
				title={data.video.title}
				viewCount={data.video.viewCount}
				publishedAt={data.video.publishedAt}
				channelId={data.video.channelId}
				channelTitle={data.video.channelTitle}
				channelAvatarUrl={data.channel?.thumbnailUrl}
				subscriberCount={data.channel?.subscriberCount}
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
				hasMore={!!nextPageToken}
			/>
		</div>
	</div>
</div>
