<script lang="ts">
	import type { CommentsResponse } from '$lib/types';
	import CommentItem from './CommentItem.svelte';
	import LoadingSkeletons from './LoadingSkeletons.svelte';

	interface Props {
		videoId: string;
	}

	let { videoId }: Props = $props();

	let comments: CommentsResponse | null = $state(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state('');
	let sortOrder = $state<'top' | 'newest'>('top');

	async function loadComments(pageToken?: string) {
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
				comments = {
					...data,
					items: [...comments.items, ...data.items]
				};
			} else {
				comments = data;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load comments';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	function handleSort(order: 'top' | 'newest') {
		sortOrder = order;
		comments = null;
		loadComments();
	}

	function loadMore() {
		if (comments?.nextPageToken) {
			loadComments(comments.nextPageToken);
		}
	}

	// Initial load
	$effect(() => {
		if (videoId) {
			comments = null;
			loadComments();
		}
	});
</script>

<div class="comments-section">
	<div class="comments-header">
		<h3 class="comments-title">
			{#if comments}
				{comments.totalResults.toLocaleString()} Comments
			{:else}
				Comments
			{/if}
		</h3>
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

	{#if loading}
		<LoadingSkeletons count={5} layout="comments" />
	{:else if error}
		<div class="comments-error">{error}</div>
	{:else if comments?.commentsDisabled}
		<div class="comments-disabled">Comments are turned off for this video.</div>
	{:else if comments}
		<div class="comments-list">
			{#each comments.items as thread (thread.id)}
				<CommentItem {thread} />
			{/each}
		</div>

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
