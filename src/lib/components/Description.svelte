<script lang="ts">
	/**
	 * Description.svelte
	 *
	 * A collapsible text component for displaying YouTube video descriptions.
	 * Descriptions longer than 200 characters are truncated with an ellipsis and
	 * a "Show more" toggle button. Uses a `<pre>` element with `white-space: pre-wrap`
	 * to preserve the original line breaks and formatting from YouTube descriptions
	 * while still wrapping long lines.
	 */

	interface Props {
		/** The raw video description text to display. */
		text: string;
	}

	/**
	 * Destructured component props via Svelte 5 $props() rune.
	 * `text` is the only prop -- the full description string.
	 */
	let { text }: Props = $props();

	/**
	 * @state Tracks whether the description is currently expanded or collapsed.
	 * Toggled by the "Show more" / "Show less" button.
	 */
	let expanded = $state(false);

	/**
	 * @derived Reactively computes whether the description text exceeds the
	 * 200-character threshold. When `text` changes (e.g., navigating to a
	 * different video), this automatically re-evaluates. If false, the full
	 * text is shown without any toggle button.
	 */
	let needsTruncation = $derived(text.length > 200);
</script>

<!-- class:expanded toggles the "expanded" CSS class for potential styling differences -->
<div class="description" class:expanded>
	<div class="description-content">
		<!-- Show full text if expanded OR if text is short enough to not need truncation -->
		{#if expanded || !needsTruncation}
			<pre class="desc-text">{text}</pre>
		{:else}
			<!-- Truncate to 200 chars with ellipsis when collapsed and text is long -->
			<pre class="desc-text">{text.slice(0, 200)}...</pre>
		{/if}
	</div>
	<!-- Toggle button only appears when the description exceeds 200 characters -->
	{#if needsTruncation}
		<button class="toggle-btn" onclick={() => (expanded = !expanded)}>
			{expanded ? 'Show less' : 'Show more'}
		</button>
	{/if}
</div>

<style>
	.description {
		background: var(--bg-secondary);
		border-radius: 12px;
		padding: 12px;
		margin: 12px 0;
		cursor: pointer;
	}

	.desc-text {
		font-family: inherit;
		font-size: 14px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
		color: var(--text-primary);
	}

	.toggle-btn {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
		padding: 4px 0;
		margin-top: 8px;
	}

	.toggle-btn:hover {
		text-decoration: underline;
	}
</style>
