<script lang="ts">
	/**
	 * @fileoverview ChannelBar component for displaying a horizontal scrollable row of subscriptions.
	 * @component
	 *
	 * Renders a row of channel avatars (similar to YouTube's subscription bar at the top of
	 * the home feed). Each avatar is a circular image with the channel name truncated below.
	 * The bar scrolls horizontally when it overflows, with the scrollbar hidden for a clean
	 * mobile-native appearance.
	 *
	 * Hovering over an avatar shows an accent-colored border as a visual affordance.
	 * Channel names are truncated to a fixed width (w-16) to keep the avatars evenly spaced.
	 */

	/** @prop channels - Array of channel objects with id, title, and thumbnail URL */
	let {
		channels
	}: {
		channels: { id: string; title: string; thumbnailUrl: string }[];
	} = $props();
</script>

<!-- Horizontally scrollable subscription bar with hidden scrollbar -->
<div class="scrollbar-hide flex gap-4 overflow-x-auto py-3">
	{#each channels as channel (channel.id)}
		<!-- Each channel: circular avatar + truncated name, wrapped in a link to the channel page -->
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

<!-- Cross-browser scrollbar hiding (same technique as FilterChips) -->
<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
