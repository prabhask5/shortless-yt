<script lang="ts">
	interface Props {
		videoId: string;
		onShowAnyway?: () => void;
	}

	let { videoId, onShowAnyway }: Props = $props();
</script>

<div class="shorts-block">
	<div class="block-content">
		<div class="block-icon">
			<svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31A7.902 7.902 0 0112 20zm6.31-3.1L7.1 5.69A7.902 7.902 0 0112 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"
				/>
			</svg>
		</div>
		<h1 class="block-title">Shorts are hidden</h1>
		<p class="block-description">
			This video appears to be a YouTube Short, which is filtered out by Shortless.
		</p>
		<div class="block-actions">
			<a
				href="https://www.youtube.com/watch?v={videoId}"
				target="_blank"
				rel="noopener"
				class="btn btn-primary"
			>
				Open on YouTube
			</a>
			{#if onShowAnyway}
				<button class="btn btn-secondary" onclick={onShowAnyway}> Show anyway (this time) </button>
			{/if}
		</div>
	</div>
</div>

<style>
	.shorts-block {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		min-height: 60dvh;
		padding: 24px;
	}

	.block-content {
		text-align: center;
		max-width: 400px;
	}

	.block-icon {
		color: var(--text-tertiary);
		margin-bottom: 24px;
	}

	.block-title {
		font-size: 24px;
		font-weight: 600;
		margin-bottom: 12px;
	}

	.block-description {
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.6;
		margin-bottom: 24px;
	}

	.block-actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
	}

	.block-actions a {
		text-decoration: none;
	}
</style>
