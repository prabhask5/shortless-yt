<script lang="ts">
	/**
	 * @fileoverview FilterChips component for horizontally scrollable filter/tag selection.
	 * @component
	 *
	 * Supports both single-select and multi-select modes.
	 * - Multi-select: clicking toggles chips on/off. At least one must remain selected.
	 * - Single-select: clicking selects one chip exclusively.
	 *
	 * The selected chip(s) are visually inverted (text color swaps with background color).
	 * The scrollbar is hidden across all browsers.
	 */

	let {
		filters,
		selected,
		onChange,
		multiSelect = false
	}: {
		filters: { label: string; value: string }[];
		selected: string | string[];
		onChange: (value: string | string[]) => void;
		multiSelect?: boolean;
	} = $props();

	function isSelected(value: string): boolean {
		if (Array.isArray(selected)) {
			return selected.includes(value);
		}
		return selected === value;
	}

	function handleClick(value: string) {
		if (multiSelect && Array.isArray(selected)) {
			if (selected.includes(value)) {
				// Don't deselect the last chip
				if (selected.length > 1) {
					onChange(selected.filter((v) => v !== value));
				}
			} else {
				onChange([...selected, value]);
			}
		} else {
			onChange(value);
		}
	}
</script>

<!-- Horizontally scrollable chip container with hidden scrollbar -->
<div class="scrollbar-hide flex gap-2 overflow-x-auto py-2">
	{#each filters as filter (filter.value)}
		<button
			onclick={() => handleClick(filter.value)}
			class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
				{isSelected(filter.value)
				? 'bg-yt-text text-yt-bg'
				: 'bg-yt-surface text-yt-text hover:bg-yt-surface-hover'}"
		>
			{filter.label}
		</button>
	{/each}
</div>

<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
