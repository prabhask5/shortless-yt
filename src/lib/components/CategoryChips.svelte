<script lang="ts">
	/**
	 * @fileoverview CategoryChips component -- a thin wrapper around FilterChips for YouTube categories.
	 * @component
	 *
	 * Adapts the YouTube video category data shape ({ id, title }) into the generic
	 * FilterChips shape ({ label, value }). This keeps FilterChips reusable for any
	 * filter UI while CategoryChips handles the category-specific data mapping.
	 *
	 * Used on the home page to filter the video feed by category (e.g., "Music", "Gaming").
	 */
	import FilterChips from './FilterChips.svelte';

	let {
		/** Array of YouTube video categories with id and title */
		categories,
		/** The currently selected category id */
		selected,
		/** Callback fired when a category chip is clicked */
		onChange
	}: {
		categories: { id: string; title: string }[];
		selected: string;
		onChange: (value: string) => void;
	} = $props();

	/** Map category objects to the { label, value } shape expected by FilterChips */
	let filters = $derived(categories.map((c) => ({ label: c.title, value: c.id })));
</script>

<FilterChips {filters} {selected} onChange={onChange as (value: string | string[]) => void} />
