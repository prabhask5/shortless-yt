<script lang="ts">
	import type { CommentThread, Comment } from '$lib/types';
	import { formatRelativeTime, formatLikeCount, sanitizeText } from '$lib/utils/format';

	interface Props {
		thread: CommentThread;
	}

	let { thread }: Props = $props();

	let showReplies = $state(false);
	// eslint-disable-next-line svelte/prefer-writable-derived -- loadedReplies must be writable (new replies loaded) while syncing from prop
	let loadedReplies = $state<Comment[]>([]);
	let loadingReplies = $state(false);

	$effect(() => {
		loadedReplies = thread.replies || [];
	});
	let repliesPageToken = $state<string | undefined>();

	async function toggleReplies() {
		if (showReplies) {
			showReplies = false;
			return;
		}

		showReplies = true;

		if (loadedReplies.length < thread.totalReplyCount) {
			loadingReplies = true;
			try {
				const params = new URLSearchParams({ parentId: thread.topLevelComment.id });
				const res = await fetch(`/api/comments?${params}`);
				const data = await res.json();
				loadedReplies = data.items || [];
				repliesPageToken = data.nextPageToken;
			} catch {
				// Keep existing replies
			} finally {
				loadingReplies = false;
			}
		}
	}

	async function loadMoreReplies() {
		if (!repliesPageToken) return;
		loadingReplies = true;
		try {
			const params = new URLSearchParams({
				parentId: thread.topLevelComment.id,
				pageToken: repliesPageToken
			});
			const res = await fetch(`/api/comments?${params}`);
			const data = await res.json();
			loadedReplies = [...loadedReplies, ...(data.items || [])];
			repliesPageToken = data.nextPageToken;
		} catch {
			// ignore
		} finally {
			loadingReplies = false;
		}
	}

	let comment = $derived(thread.topLevelComment);
</script>

<div class="comment-thread">
	<div class="comment">
		<div class="comment-avatar">
			{#if comment.authorProfileImageUrl}
				<img
					src={comment.authorProfileImageUrl}
					alt={comment.authorDisplayName}
					loading="lazy"
					referrerpolicy="no-referrer"
				/>
			{:else}
				<span>{comment.authorDisplayName.charAt(0).toUpperCase()}</span>
			{/if}
		</div>
		<div class="comment-body">
			<div class="comment-header">
				<span class="comment-author">{comment.authorDisplayName}</span>
				<span class="comment-time">{formatRelativeTime(comment.publishedAt)}</span>
			</div>
			<div class="comment-text">{sanitizeText(comment.textOriginal || comment.textDisplay)}</div>
			<div class="comment-actions">
				{#if comment.likeCount > 0}
					<span class="like-count">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
							/>
						</svg>
						{formatLikeCount(comment.likeCount)}
					</span>
				{/if}
				{#if thread.totalReplyCount > 0}
					<button class="replies-toggle" onclick={toggleReplies}>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="currentColor"
							class:rotated={showReplies}
						>
							<path d="M7 10l5 5 5-5z" />
						</svg>
						{thread.totalReplyCount}
						{thread.totalReplyCount === 1 ? 'reply' : 'replies'}
					</button>
				{/if}
			</div>

			{#if showReplies}
				<div class="replies">
					{#each loadedReplies as reply (reply.id)}
						<div class="comment reply">
							<div class="comment-avatar small">
								{#if reply.authorProfileImageUrl}
									<img
										src={reply.authorProfileImageUrl}
										alt={reply.authorDisplayName}
										loading="lazy"
										referrerpolicy="no-referrer"
									/>
								{:else}
									<span>{reply.authorDisplayName.charAt(0).toUpperCase()}</span>
								{/if}
							</div>
							<div class="comment-body">
								<div class="comment-header">
									<span class="comment-author">{reply.authorDisplayName}</span>
									<span class="comment-time">{formatRelativeTime(reply.publishedAt)}</span>
								</div>
								<div class="comment-text">
									{sanitizeText(reply.textOriginal || reply.textDisplay)}
								</div>
								{#if reply.likeCount > 0}
									<div class="comment-actions">
										<span class="like-count">
											<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
												<path
													d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
												/>
											</svg>
											{formatLikeCount(reply.likeCount)}
										</span>
									</div>
								{/if}
							</div>
						</div>
					{/each}

					{#if loadingReplies}
						<div class="loading-replies">Loading replies...</div>
					{/if}

					{#if repliesPageToken && !loadingReplies}
						<button class="show-more-replies" onclick={loadMoreReplies}> Show more replies </button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.comment-thread {
		padding: 12px 0;
	}

	.comment {
		display: flex;
		gap: 12px;
	}

	.comment-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
		background: var(--bg-tertiary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.comment-avatar.small {
		width: 24px;
		height: 24px;
		font-size: 10px;
	}

	.comment-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.comment-body {
		flex: 1;
		min-width: 0;
	}

	.comment-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.comment-author {
		font-size: 13px;
		font-weight: 500;
	}

	.comment-time {
		font-size: 12px;
		color: var(--text-secondary);
	}

	.comment-text {
		font-size: 14px;
		line-height: 1.5;
		word-break: break-word;
		white-space: pre-wrap;
	}

	.comment-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 8px;
	}

	.like-count {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--text-secondary);
	}

	.replies-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-link);
		padding: 4px 8px;
		border-radius: 18px;
		min-height: 32px;
	}

	.replies-toggle:hover {
		background: rgba(62, 166, 255, 0.1);
	}

	.replies-toggle svg {
		transition: transform 0.2s;
	}

	.replies-toggle svg.rotated {
		transform: rotate(180deg);
	}

	.replies {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.reply {
		gap: 8px;
	}

	.loading-replies {
		font-size: 13px;
		color: var(--text-secondary);
		padding: 8px 0;
	}

	.show-more-replies {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-link);
		padding: 8px 0;
		text-align: left;
	}

	.show-more-replies:hover {
		text-decoration: underline;
	}
</style>
