<script lang="ts">
	let { variant }: { variant: 'video-card' | 'channel-card' | 'comment' | 'text-line' } = $props();
</script>

{#if variant === 'video-card'}
	<div class="flex flex-col gap-2">
		<div class="bg-yt-surface aspect-video animate-pulse rounded-xl"></div>
		<div class="flex gap-3">
			<div class="bg-yt-surface h-9 w-9 shrink-0 animate-pulse rounded-full"></div>
			<div class="flex-1 space-y-2">
				<div class="bg-yt-surface h-4 w-full animate-pulse rounded"></div>
				<div class="bg-yt-surface h-4 w-3/4 animate-pulse rounded"></div>
				<div class="bg-yt-surface h-3 w-1/2 animate-pulse rounded"></div>
			</div>
		</div>
	</div>
{:else if variant === 'channel-card'}
	<div class="flex items-center gap-4 p-3">
		<div class="bg-yt-surface h-20 w-20 shrink-0 animate-pulse rounded-full md:h-28 md:w-28"></div>
		<div class="flex-1 space-y-2">
			<div class="bg-yt-surface h-5 w-48 animate-pulse rounded"></div>
			<div class="bg-yt-surface h-3 w-32 animate-pulse rounded"></div>
			<div class="bg-yt-surface h-3 w-64 animate-pulse rounded"></div>
		</div>
	</div>
{:else if variant === 'comment'}
	<div class="flex gap-3">
		<div class="bg-yt-surface h-8 w-8 shrink-0 animate-pulse rounded-full"></div>
		<div class="flex-1 space-y-2">
			<div class="bg-yt-surface h-3 w-32 animate-pulse rounded"></div>
			<div class="bg-yt-surface h-3 w-full animate-pulse rounded"></div>
			<div class="bg-yt-surface h-3 w-2/3 animate-pulse rounded"></div>
		</div>
	</div>
{:else if variant === 'text-line'}
	<div class="bg-yt-surface h-4 w-full animate-pulse rounded"></div>
{/if}
