<script lang="ts" generics="T">
	/**
	 * @fileoverview VirtualFeed component for efficiently rendering large lists of items.
	 * @component
	 *
	 * Uses @tanstack/svelte-virtual's window virtualizer to only render the rows that
	 * are currently visible in the viewport (plus an overscan buffer of 5 rows). This
	 * prevents DOM bloat when displaying hundreds or thousands of video cards.
	 *
	 * For multi-column grid layouts (columns > 1), items are first chunked into rows
	 * (each row containing `columns` items), and the virtualizer operates on rows rather
	 * than individual items. Each virtual row is rendered as a CSS grid.
	 *
	 * The virtualizer is initialized with count=0 and estimateSize=300 as placeholder
	 * values. The $effect immediately syncs the real values (actual row count, configured
	 * estimateRowHeight, and gap) once the component mounts and whenever props change.
	 * This two-step approach is necessary because createWindowVirtualizer runs at
	 * declaration time before reactive props are available.
	 *
	 * The generic type parameter T allows this component to virtualize any item type
	 * (VideoItem, ChannelItem, etc.) with a type-safe children snippet.
	 */
	import type { Snippet } from 'svelte';
	import { createWindowVirtualizer } from '@tanstack/svelte-virtual';

	let {
		/** The full list of items to virtualize */
		items,
		/** Number of columns in the grid (1 = single column list) */
		columns = 1,
		/** Estimated height of each row in pixels, used before actual measurement */
		estimateRowHeight = 300,
		/** Gap between rows in pixels */
		gap = 16,
		/** Render snippet for each individual item; receives the item as its argument */
		children
	}: {
		items: T[];
		columns?: number;
		estimateRowHeight?: number;
		gap?: number;
		children: Snippet<[T]>;
	} = $props();

	/**
	 * Chunks the flat items array into rows of `columns` length.
	 * For example, with 10 items and 3 columns, this produces 4 rows
	 * (3 items, 3 items, 3 items, 1 item). The virtualizer then treats
	 * each row as a single virtual element.
	 */
	let rows = $derived.by(() => {
		const result: T[][] = [];
		for (let i = 0; i < items.length; i += columns) {
			result.push(items.slice(i, i + columns));
		}
		return result;
	});

	/*
	 * Initialize the virtualizer with zeroed-out placeholder values.
	 * We can't pass the real values here because createWindowVirtualizer
	 * runs at module initialization time, before Svelte's reactive system
	 * has resolved the prop values. The $effect below immediately syncs
	 * the correct values on mount. overscan=5 means 5 extra rows are
	 * rendered above and below the visible viewport for smoother scrolling.
	 */
	const virtualizer = createWindowVirtualizer<HTMLDivElement>({
		count: 0,
		estimateSize: () => 300,
		overscan: 5,
		gap: 0
	});

	/*
	 * Sync real reactive values into the virtualizer whenever they change.
	 * This effect runs on mount and re-runs when rows.length, estimateRowHeight,
	 * or gap changes (e.g., when items are added or the layout configuration changes).
	 */
	$effect(() => {
		$virtualizer.setOptions({
			count: rows.length,
			estimateSize: () => estimateRowHeight,
			gap
		});
	});

	/** The subset of virtual row items currently visible (plus overscan buffer) */
	let virtualItems = $derived($virtualizer.getVirtualItems());
	/** Total pixel height of all rows, used to size the scroll container */
	let totalSize = $derived($virtualizer.getTotalSize());
</script>

<!-- Outer container: sized to the total virtual height so the browser's native
     scrollbar reflects the full list length. position:relative anchors the
     absolutely-positioned row elements inside. -->
<div style="position: relative; width: 100%; height: {totalSize}px;">
	{#each virtualItems as virtualRow (virtualRow.key)}
		{@const rowItems = rows[virtualRow.index]}
		<!-- Each row is absolutely positioned at its calculated Y offset via translateY.
		     This avoids layout recalculation when rows enter/leave the viewport. -->
		<div
			style="position: absolute; top: 0; left: 0; width: 100%; height: {virtualRow.size}px; transform: translateY({virtualRow.start}px);"
		>
			{#if columns > 1}
				<!-- Multi-column: render items in a CSS grid row -->
				<div
					style="display: grid; grid-template-columns: repeat({columns}, minmax(0, 1fr)); gap: {gap}px; height: 100%;"
				>
					{#each rowItems as item, i (i)}
						{@render children(item)}
					{/each}
				</div>
			{:else}
				<!-- Single column: render items directly without a grid wrapper -->
				{#each rowItems as item, i (i)}
					{@render children(item)}
				{/each}
			{/if}
		</div>
	{/each}
</div>
