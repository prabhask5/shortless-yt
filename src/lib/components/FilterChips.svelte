<script lang="ts">
	/**
	 * @fileoverview FilterChips component for horizontally scrollable filter/tag selection.
	 * @component
	 *
	 * Renders a row of pill-shaped filter buttons that scroll horizontally when they
	 * overflow the container width. The selected chip is visually inverted (text color
	 * swaps with background color) to indicate the active filter.
	 *
	 * Used by CategoryChips (which wraps this component) and potentially other filter UIs.
	 * The scrollbar is hidden across all browsers using a combination of CSS tricks:
	 * - ::-webkit-scrollbar { display: none } for Chrome/Safari/Edge
	 * - -ms-overflow-style: none for IE/legacy Edge
	 * - scrollbar-width: none for Firefox
	 */

	let {
		/** Array of filter options, each with a display label and a programmatic value */
		filters,
		/** The currently selected filter value (used to highlight the active chip) */
		selected,
		/** Callback fired when a chip is clicked, receives the filter's value */
		onChange
	}: {
		filters: { label: string; value: string }[];
		selected: string;
		onChange: (value: string) => void;
	} = $props();
</script>

<!-- Horizontally scrollable chip container with hidden scrollbar -->
<div class="scrollbar-hide flex gap-2 overflow-x-auto py-2">
	{#each filters as filter (filter.value)}
		<!-- Active chip: inverted colors (bg-yt-text text-yt-bg).
		     Inactive chip: surface background with hover highlight. -->
		<button
			onclick={() => onChange(filter.value)}
			class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
				{selected === filter.value
				? 'bg-yt-text text-yt-bg'
				: 'bg-yt-surface text-yt-text hover:bg-yt-surface-hover'}"
		>
			{filter.label}
		</button>
	{/each}
</div>

<!-- Cross-browser scrollbar hiding: WebKit pseudo-element for Chrome/Safari,
     -ms-overflow-style for IE, scrollbar-width for Firefox -->
<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
