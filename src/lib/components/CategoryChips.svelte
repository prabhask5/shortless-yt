<script lang="ts">
	import FilterChips from './FilterChips.svelte';

	let {
		categories,
		selected,
		onChange
	}: {
		categories: { id: string; title: string }[];
		selected: string;
		onChange: (value: string) => void;
	} = $props();

	let filters = $derived(categories.map((c) => ({ label: c.title, value: c.id })));
</script>

<FilterChips {filters} {selected} {onChange} />
