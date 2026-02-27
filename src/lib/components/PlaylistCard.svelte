<script lang="ts">
	/**
	 * @fileoverview PlaylistCard component for displaying a playlist in search results and feeds.
	 * @component
	 *
	 * Renders a compact horizontal card matching VideoCard and ChannelCard sizing.
	 * Shows a small thumbnail with a video count overlay, plus title and channel name.
	 */
	import type { PlaylistItem } from '$lib/types';

	/** @prop playlist - The playlist data object with title, thumbnail, channel, and item count */
	let { playlist }: { playlist: PlaylistItem } = $props();
</script>

<a
	href="/playlist/{playlist.id}"
	class="hover:bg-yt-surface-hover group flex items-center gap-3 rounded-xl p-2"
>
	<div class="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg sm:w-40">
		<img
			src={playlist.thumbnailUrl}
			alt={playlist.title}
			class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
			loading="lazy"
		/>
		<div
			class="absolute inset-y-0 right-0 flex w-14 items-center justify-center bg-black/70 backdrop-blur-sm"
		>
			<div class="flex flex-col items-center gap-0.5 text-white">
				<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
					<path
						d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"
					/>
				</svg>
				<span class="text-[10px] font-medium">{playlist.itemCount}</span>
			</div>
		</div>
	</div>

	<div class="min-w-0 flex-1">
		<h3 class="text-yt-text line-clamp-2 text-sm font-medium">
			{playlist.title}
		</h3>
		<p class="text-yt-text-secondary mt-1 text-xs">
			{playlist.channelTitle}
		</p>
		<p class="text-yt-text-secondary mt-0.5 text-xs">
			{playlist.itemCount} videos
		</p>
	</div>
</a>
