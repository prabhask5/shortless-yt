<script lang="ts">
	let {
		filters,
		selected,
		onChange
	}: {
		filters: { label: string; value: string }[];
		selected: string;
		onChange: (value: string) => void;
	} = $props();
</script>

<div class="scrollbar-hide flex gap-2 overflow-x-auto py-2">
	{#each filters as filter (filter.value)}
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

<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
