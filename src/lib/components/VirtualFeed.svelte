<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { createWindowVirtualizer } from '@tanstack/svelte-virtual';

	let {
		items,
		columns = 1,
		estimateRowHeight = 300,
		gap = 16,
		children
	}: {
		items: T[];
		columns?: number;
		estimateRowHeight?: number;
		gap?: number;
		children: Snippet<[T]>;
	} = $props();

	let rows = $derived.by(() => {
		const result: T[][] = [];
		for (let i = 0; i < items.length; i += columns) {
			result.push(items.slice(i, i + columns));
		}
		return result;
	});

	const virtualizer = createWindowVirtualizer<HTMLDivElement>({
		count: 0,
		estimateSize: () => 300,
		overscan: 5,
		gap: 0
	});

	$effect(() => {
		$virtualizer.setOptions({
			count: rows.length,
			estimateSize: () => estimateRowHeight,
			gap
		});
	});

	let virtualItems = $derived($virtualizer.getVirtualItems());
	let totalSize = $derived($virtualizer.getTotalSize());
</script>

<div style="position: relative; width: 100%; height: {totalSize}px;">
	{#each virtualItems as virtualRow (virtualRow.key)}
		{@const rowItems = rows[virtualRow.index]}
		<div
			style="position: absolute; top: 0; left: 0; width: 100%; height: {virtualRow.size}px; transform: translateY({virtualRow.start}px);"
		>
			{#if columns > 1}
				<div
					style="display: grid; grid-template-columns: repeat({columns}, minmax(0, 1fr)); gap: {gap}px; height: 100%;"
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
		</div>
	{/each}
</div>
