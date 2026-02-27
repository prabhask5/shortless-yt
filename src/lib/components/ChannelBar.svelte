<script lang="ts">
	let {
		channels
	}: {
		channels: { id: string; title: string; thumbnailUrl: string }[];
	} = $props();
</script>

<div class="scrollbar-hide flex gap-4 overflow-x-auto py-3">
	{#each channels as channel (channel.id)}
		<a href="/channel/{channel.id}" class="flex shrink-0 flex-col items-center gap-1.5">
			<img
				src={channel.thumbnailUrl}
				alt={channel.title}
				class="hover:border-yt-accent h-14 w-14 rounded-full border-2 border-transparent object-cover transition-colors"
				loading="lazy"
			/>
			<span class="text-yt-text-secondary w-16 truncate text-center text-[10px]">
				{channel.title}
			</span>
		</a>
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
