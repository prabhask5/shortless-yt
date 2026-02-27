<script lang="ts">
	import type { PlaylistItem } from '$lib/types';

	let { playlist }: { playlist: PlaylistItem } = $props();
</script>

<a href="/playlist/{playlist.id}" class="group flex flex-col gap-2">
	<div class="relative aspect-video overflow-hidden rounded-xl">
		<!-- Stacked look: pseudo-borders behind the thumbnail -->
		<div
			class="border-yt-border absolute inset-0 translate-x-1 -translate-y-1 scale-[0.97] rounded-xl border-2 opacity-40"
		></div>
		<div
			class="border-yt-border absolute inset-0 translate-x-0.5 -translate-y-0.5 scale-[0.985] rounded-xl border-2 opacity-60"
		></div>

		<img
			src={playlist.thumbnailUrl}
			alt={playlist.title}
			class="relative h-full w-full rounded-xl object-cover transition-transform duration-200 group-hover:scale-105"
			loading="lazy"
		/>

		<!-- Item count overlay on right side -->
		<div
			class="absolute inset-y-0 right-0 flex w-24 items-center justify-center rounded-r-xl bg-black/70 backdrop-blur-sm"
		>
			<div class="flex flex-col items-center gap-1 text-white">
				<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
					<path
						d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"
					/>
				</svg>
				<span class="text-xs font-medium">{playlist.itemCount} videos</span>
			</div>
		</div>
	</div>

	<div class="min-w-0">
		<h3 class="text-yt-text line-clamp-2 text-sm font-medium">
			{playlist.title}
		</h3>
		<p class="text-yt-text-secondary mt-1 text-xs">
			{playlist.channelTitle}
		</p>
	</div>
</a>
