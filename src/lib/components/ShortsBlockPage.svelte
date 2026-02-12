<script lang="ts">
	/**
	 * ShortsBlockPage.svelte
	 *
	 * A full-page placeholder displayed when a user navigates to a video that has
	 * been identified as a YouTube Short. Since the core purpose of this app is to
	 * provide a Shorts-free YouTube experience, this component intercepts Short
	 * videos and shows an informative block screen instead of playing them.
	 *
	 * Provides two actions:
	 *   1. "Open on YouTube" -- opens the video in a new tab on youtube.com
	 *   2. "Show anyway (this time)" -- optional override that lets the user
	 *      bypass the block for this specific video (only shown when the parent
	 *      provides the `onShowAnyway` callback)
	 */

	interface Props {
		/** The YouTube video ID of the blocked Short, used for the YouTube link. */
		videoId: string;
		/**
		 * Optional callback to bypass the Shorts block for this video.
		 * When provided, a "Show anyway" button is rendered. When omitted,
		 * the user can only open the video externally on YouTube.
		 */
		onShowAnyway?: () => void;
	}

	/**
	 * Destructured component props via Svelte 5 $props() rune.
	 * `videoId` is always required; `onShowAnyway` is optional and controls
	 * whether the bypass button is rendered.
	 */
	let { videoId, onShowAnyway }: Props = $props();
</script>

<!-- Full-page centered block screen, vertically centered in the viewport -->
<div class="shorts-block">
	<div class="block-content">
		<!-- "No entry" / block circle icon to visually indicate content is blocked -->
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
			<!-- Always available: opens the Short on youtube.com in a new tab -->
			<a
				href="https://www.youtube.com/watch?v={videoId}"
				target="_blank"
				rel="noopener"
				class="btn btn-primary"
			>
				Open on YouTube
			</a>
			<!-- Optional bypass: only rendered when parent provides the onShowAnyway callback -->
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
