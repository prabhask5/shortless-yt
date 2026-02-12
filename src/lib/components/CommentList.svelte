<script lang="ts">
	/**
	 * CommentList.svelte
	 *
	 * Fetches and renders the comment section for a given video.
	 * Features:
	 *   - Sort toggle between "Top" (relevance) and "Newest" (time)
	 *   - Paginated loading via "Load more comments" button
	 *   - Handles disabled-comments and error states gracefully
	 *
	 * Each comment thread (top-level comment + replies) is rendered by
	 * the CommentItem child component.
	 */

	import type { CommentsResponse } from '$lib/types';
	import CommentItem from './CommentItem.svelte';
	import LoadingSkeletons from './LoadingSkeletons.svelte';

	interface Props {
		/** The YouTube video ID whose comments to fetch */
		videoId: string;
	}

	/** Destructure props with Svelte 5 $props() rune */
	let { videoId }: Props = $props();

	/** $state rune: holds the current comments response (items + pagination token + totalResults) */
	let comments: CommentsResponse | null = $state(null);
	/** $state rune: true during the initial comment load (shows skeleton placeholders) */
	let loading = $state(true);
	/** $state rune: true while fetching the next page of comments (disables "Load more" button) */
	let loadingMore = $state(false);
	/** $state rune: error message string; empty when no error */
	let error = $state('');
	/** $state rune: current sort order for comments -- 'top' (relevance) or 'newest' (chronological) */
	let sortOrder = $state<'top' | 'newest'>('top');

	/**
	 * Fetches comments from the server API endpoint.
	 * When `pageToken` is provided, appends results to existing comments (pagination).
	 * When omitted, replaces all comments (initial load or sort change).
	 * @param pageToken - Optional YouTube API page token for fetching the next page
	 */
	async function loadComments(pageToken?: string) {
		// Distinguish between initial load (full skeleton) and pagination (inline spinner)
		if (pageToken) {
			loadingMore = true;
		} else {
			loading = true;
		}
		error = '';

		try {
			const params = new URLSearchParams({ id: videoId, order: sortOrder });
			if (pageToken) params.set('pageToken', pageToken);

			const res = await fetch(`/api/comments?${params}`);
			const data: CommentsResponse = await res.json();

			if (!res.ok) {
				throw new Error('Failed to load comments');
			}

			if (pageToken && comments) {
				// Pagination: merge new items with existing ones, keeping updated metadata
				comments = {
					...data,
					items: [...comments.items, ...data.items]
				};
			} else {
				// Fresh load: replace everything
				comments = data;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load comments';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	/**
	 * Handles sort order toggle. Resets comments to null (triggers skeleton)
	 * and re-fetches from the first page with the new sort order.
	 * @param order - The new sort order ('top' or 'newest')
	 */
	function handleSort(order: 'top' | 'newest') {
		sortOrder = order;
		comments = null;
		loadComments();
	}

	/**
	 * Loads the next page of comments if a pagination token exists.
	 * Called by the "Load more comments" button.
	 */
	function loadMore() {
		if (comments?.nextPageToken) {
			loadComments(comments.nextPageToken);
		}
	}

	/**
	 * $effect rune: triggers on initial mount and whenever `videoId` changes
	 * (e.g. navigating from one watch page to another). Resets state and
	 * fetches comments for the new video.
	 */
	$effect(() => {
		if (videoId) {
			comments = null;
			loadComments();
		}
	});
</script>

<!-- Comments section rendered below the video metadata on the watch page -->
<div class="comments-section">
	<div class="comments-header">
		<!-- Show total comment count once loaded, otherwise just "Comments" -->
		<h3 class="comments-title">
			{#if comments}
				{comments.totalResults.toLocaleString()} Comments
			{:else}
				Comments
			{/if}
		</h3>
		<!-- Sort toggle: class:active highlights the currently selected sort order -->
		<div class="sort-buttons">
			<button class="sort-btn" class:active={sortOrder === 'top'} onclick={() => handleSort('top')}>
				Top
			</button>
			<button
				class="sort-btn"
				class:active={sortOrder === 'newest'}
				onclick={() => handleSort('newest')}
			>
				Newest
			</button>
		</div>
	</div>

	<!-- State-based rendering: loading skeletons -> error -> comments disabled -> comment threads -->
	{#if loading}
		<LoadingSkeletons count={5} layout="comments" />
	{:else if error}
		<div class="comments-error">{error}</div>
	{:else if comments?.commentsDisabled}
		<div class="comments-disabled">Comments are turned off for this video.</div>
	{:else if comments}
		<!-- Each thread is keyed by thread.id for efficient list diffing -->
		<div class="comments-list">
			{#each comments.items as thread (thread.id)}
				<CommentItem {thread} />
			{/each}
		</div>

		<!-- "Load more" button only appears when there's a next page token from the API -->
		{#if comments.nextPageToken}
			<button class="load-more-btn btn btn-secondary" onclick={loadMore} disabled={loadingMore}>
				{loadingMore ? 'Loading...' : 'Load more comments'}
			</button>
		{/if}
	{/if}
</div>

<style>
	.comments-section {
		padding: 24px 0;
		border-top: 1px solid var(--border-color);
	}

	.comments-header {
		display: flex;
		align-items: center;
		gap: 24px;
		margin-bottom: 24px;
	}

	.comments-title {
		font-size: 16px;
		font-weight: 600;
	}

	.sort-buttons {
		display: flex;
		gap: 0;
	}

	.sort-btn {
		padding: 8px 16px;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-secondary);
		border-radius: 8px;
		min-height: 44px;
	}

	.sort-btn:hover {
		background: var(--bg-hover);
	}

	.sort-btn.active {
		color: var(--text-primary);
		font-weight: 600;
	}

	.comments-list {
		display: flex;
		flex-direction: column;
	}

	.comments-error {
		padding: 16px;
		color: var(--red-text);
		font-size: 14px;
	}

	.comments-disabled {
		padding: 24px 0;
		color: var(--text-secondary);
		font-size: 14px;
		text-align: center;
	}

	.load-more-btn {
		margin: 16px auto;
		display: block;
	}
</style>
