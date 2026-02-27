<script lang="ts">
	import type { CommentItem } from '$lib/types';

	let {
		comments,
		loading,
		onLoadMore,
		hasMore
	}: {
		comments: CommentItem[];
		loading: boolean;
		onLoadMore: () => void;
		hasMore: boolean;
	} = $props();

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

	function formatLikeCount(count: number): string {
		if (count === 0) return '';
		if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
		if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
		return `${count}`;
	}
</script>

<div class="flex flex-col gap-4 py-4">
	<h3 class="text-yt-text text-base font-medium">Comments</h3>

	{#each comments as comment (comment.id)}
		<div class="flex gap-3">
			<img
				src={comment.authorAvatarUrl}
				alt={comment.authorName}
				class="h-8 w-8 shrink-0 rounded-full"
				loading="lazy"
			/>

			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<span class="text-yt-text text-xs font-medium">{comment.authorName}</span>
					<span class="text-yt-text-secondary text-xs">{formatTimeAgo(comment.publishedAt)}</span>
				</div>

				<p class="text-yt-text mt-1 text-sm break-words whitespace-pre-wrap">
					{comment.text}
				</p>

				<div class="mt-2 flex items-center gap-4">
					{#if comment.likeCount > 0}
						<span class="text-yt-text-secondary flex items-center gap-1 text-xs">
							<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
								<path
									d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 2 7.59 8.59C7.22 8.95 7 9.45 7 10v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
								/>
							</svg>
							{formatLikeCount(comment.likeCount)}
						</span>
					{/if}

					{#if comment.replyCount > 0}
						<button class="text-yt-accent text-xs font-medium hover:underline">
							{comment.replyCount}
							{comment.replyCount === 1 ? 'reply' : 'replies'}
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/each}

	{#if loading}
		<div class="flex justify-center py-4">
			<div
				class="border-yt-text-secondary border-t-yt-accent h-6 w-6 animate-spin rounded-full border-2"
			></div>
		</div>
	{/if}

	{#if hasMore && !loading}
		<button
			onclick={onLoadMore}
			class="border-yt-border text-yt-accent hover:bg-yt-surface w-full rounded-full border py-2 text-sm font-medium"
		>
			Show more comments
		</button>
	{/if}

	{#if !loading && comments.length === 0}
		<p class="text-yt-text-secondary py-4 text-center text-sm">No comments yet</p>
	{/if}
</div>
