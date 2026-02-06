<script lang="ts">
	interface Props {
		count?: number;
		layout?: 'grid' | 'list' | 'compact' | 'comments';
	}

	let { count = 4, layout = 'grid' }: Props = $props();

	let items = $derived(Array.from({ length: count }, (_, i) => i));
</script>

{#if layout === 'grid'}
	{#each items as i (i)}
		<div class="skeleton-card">
			<div class="skeleton skeleton-thumb"></div>
			<div class="skeleton-info">
				<div class="skeleton skeleton-avatar"></div>
				<div class="skeleton-text">
					<div class="skeleton skeleton-title"></div>
					<div class="skeleton skeleton-subtitle"></div>
					<div class="skeleton skeleton-meta"></div>
				</div>
			</div>
		</div>
	{/each}
{:else if layout === 'list'}
	{#each items as i (i)}
		<div class="skeleton-list-item">
			<div class="skeleton skeleton-list-thumb"></div>
			<div class="skeleton-list-info">
				<div class="skeleton skeleton-list-title"></div>
				<div class="skeleton skeleton-list-sub"></div>
				<div class="skeleton skeleton-list-meta"></div>
			</div>
		</div>
	{/each}
{:else if layout === 'compact'}
	{#each items as i (i)}
		<div class="skeleton-compact">
			<div class="skeleton skeleton-compact-thumb"></div>
			<div class="skeleton-compact-info">
				<div class="skeleton skeleton-compact-title"></div>
				<div class="skeleton skeleton-compact-sub"></div>
			</div>
		</div>
	{/each}
{:else if layout === 'comments'}
	{#each items as i (i)}
		<div class="skeleton-comment">
			<div class="skeleton skeleton-comment-avatar"></div>
			<div class="skeleton-comment-body">
				<div class="skeleton skeleton-comment-name"></div>
				<div class="skeleton skeleton-comment-text"></div>
				<div class="skeleton skeleton-comment-text2"></div>
			</div>
		</div>
	{/each}
{/if}

<style>
	/* Grid skeleton */
	.skeleton-card {
		display: flex;
		flex-direction: column;
	}

	.skeleton-thumb {
		width: 100%;
		aspect-ratio: 16/9;
		border-radius: 12px;
	}

	.skeleton-info {
		display: flex;
		gap: 12px;
		padding: 12px 0;
	}

	.skeleton-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.skeleton-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-title {
		height: 14px;
		width: 90%;
	}

	.skeleton-subtitle {
		height: 12px;
		width: 60%;
	}

	.skeleton-meta {
		height: 12px;
		width: 40%;
	}

	/* List skeleton */
	.skeleton-list-item {
		display: flex;
		gap: 16px;
	}

	.skeleton-list-thumb {
		width: 360px;
		aspect-ratio: 16/9;
		border-radius: 12px;
		flex-shrink: 0;
	}

	.skeleton-list-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 8px 0;
	}

	.skeleton-list-title {
		height: 18px;
		width: 80%;
	}

	.skeleton-list-sub {
		height: 14px;
		width: 40%;
	}

	.skeleton-list-meta {
		height: 14px;
		width: 30%;
	}

	/* Compact skeleton */
	.skeleton-compact {
		display: flex;
		gap: 8px;
	}

	.skeleton-compact-thumb {
		width: 168px;
		aspect-ratio: 16/9;
		border-radius: 8px;
		flex-shrink: 0;
	}

	.skeleton-compact-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-compact-title {
		height: 14px;
		width: 90%;
	}

	.skeleton-compact-sub {
		height: 12px;
		width: 60%;
	}

	/* Comments skeleton */
	.skeleton-comment {
		display: flex;
		gap: 16px;
		padding: 12px 0;
	}

	.skeleton-comment-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.skeleton-comment-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-comment-name {
		height: 12px;
		width: 120px;
	}

	.skeleton-comment-text {
		height: 14px;
		width: 90%;
	}

	.skeleton-comment-text2 {
		height: 14px;
		width: 60%;
	}

	@media (max-width: 768px) {
		.skeleton-list-item {
			flex-direction: column;
		}
		.skeleton-list-thumb {
			width: 100%;
		}
	}
</style>
