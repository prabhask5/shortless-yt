<script lang="ts">
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import VideoDetails from '$lib/components/VideoDetails.svelte';
	import VideoChapters from '$lib/components/VideoChapters.svelte';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import type { CommentItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	let playerStartTime = $state(data.startTime);

	function handleSeek(seconds: number) {
		playerStartTime = seconds;
	}

	// svelte-ignore state_referenced_locally
	let comments = $state<CommentItem[]>(data.comments);
	// svelte-ignore state_referenced_locally
	let nextPageToken = $state(data.commentsNextPageToken);
	let loadingMoreComments = $state(false);

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
