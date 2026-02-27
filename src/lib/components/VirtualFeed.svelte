<script lang="ts" generics="T">
	/**
	 * @fileoverview VirtualFeed component for rendering lists of items in a grid.
	 * @component
	 *
	 * Currently renders items directly without virtualization (capped at 20 items).
	 * Once confirmed working, virtualization via @tanstack/svelte-virtual will be
	 * re-enabled for performance with larger lists.
	 */
	import type { Snippet } from 'svelte';

	let {
		items,
		columns = 1,
		estimateRowHeight: _estimateRowHeight = 300,
		gap = 16,
		children
	}: {
		items: T[];
		columns?: number;
		estimateRowHeight?: number;
		gap?: number;
		children: Snippet<[T]>;
	} = $props();

	/** Cap items at 20 to keep DOM manageable. */
	const MAX_ITEMS = 20;

	/** Capped items list. */
	let cappedItems = $derived(items.slice(0, MAX_ITEMS));

	/** Chunks items into rows of `columns` length for grid rendering. */
	let rows = $derived.by(() => {
		const result: T[][] = [];
		for (let i = 0; i < cappedItems.length; i += columns) {
			result.push(cappedItems.slice(i, i + columns));
		}
		return result;
	});
</script>

<div style="display: flex; flex-direction: column; gap: {gap}px; width: 100%;">
	{#each rows as rowItems, rowIndex (rowIndex)}
		{#if columns > 1}
			<div
				style="display: grid; grid-template-columns: repeat({columns}, minmax(0, 1fr)); gap: {gap}px;"
			>
				{#each rowItems as item, i (i)}
					{@render children(item)}
				{/each}
			</div>
		{:else}
			{#each rowItems as item, i (i)}
				{@render children(item)}
			{/each}
		{/if}
	{/each}
</div>
