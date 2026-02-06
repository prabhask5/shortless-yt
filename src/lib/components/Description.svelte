<script lang="ts">
	interface Props {
		text: string;
	}

	let { text }: Props = $props();
	let expanded = $state(false);
	let needsTruncation = $derived(text.length > 200);
</script>

<div class="description" class:expanded>
	<div class="description-content">
		{#if expanded || !needsTruncation}
			<pre class="desc-text">{text}</pre>
		{:else}
			<pre class="desc-text">{text.slice(0, 200)}...</pre>
		{/if}
	</div>
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
