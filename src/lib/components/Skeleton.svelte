<script lang="ts">
	/**
	 * @fileoverview Skeleton component for displaying loading placeholders.
	 * @component
	 *
	 * Provides four skeleton variants that mirror the shape of their real content
	 * counterparts. Each variant uses Tailwind's `animate-pulse` to create a
	 * subtle breathing animation, signaling to the user that content is loading.
	 *
	 * Variants:
	 * - "video-card": Mimics VideoCard -- 16:9 thumbnail placeholder + avatar circle + text lines
	 * - "channel-card": Mimics ChannelCard -- large circular avatar + text lines
	 * - "comment": Mimics a comment -- small avatar circle + text lines
	 * - "text-line": A single full-width text line placeholder
	 *
	 * The placeholder dimensions (widths like w-3/4, w-1/2, w-48) approximate the
	 * typical content width to reduce layout shift when real content loads in.
	 */

	/** @prop variant - Which skeleton shape to render, matching the content type being loaded */
	let { variant }: { variant: 'video-card' | 'channel-card' | 'comment' | 'text-line' } = $props();
</script>

<!-- Video card skeleton: 16:9 thumbnail + channel avatar + 3 text lines -->
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
	<!-- Channel card skeleton: large avatar circle + text lines -->
{:else if variant === 'channel-card'}
	<div class="flex items-center gap-4 p-3">
		<div class="bg-yt-surface h-20 w-20 shrink-0 animate-pulse rounded-full md:h-28 md:w-28"></div>
		<div class="flex-1 space-y-2">
			<div class="bg-yt-surface h-5 w-48 animate-pulse rounded"></div>
			<div class="bg-yt-surface h-3 w-32 animate-pulse rounded"></div>
			<div class="bg-yt-surface h-3 w-64 animate-pulse rounded"></div>
		</div>
	</div>
	<!-- Comment skeleton: small avatar + comment text lines -->
{:else if variant === 'comment'}
	<div class="flex gap-3">
		<div class="bg-yt-surface h-8 w-8 shrink-0 animate-pulse rounded-full"></div>
		<div class="flex-1 space-y-2">
			<div class="bg-yt-surface h-3 w-32 animate-pulse rounded"></div>
			<div class="bg-yt-surface h-3 w-full animate-pulse rounded"></div>
			<div class="bg-yt-surface h-3 w-2/3 animate-pulse rounded"></div>
		</div>
	</div>
	<!-- Single text line placeholder -->
{:else if variant === 'text-line'}
	<div class="bg-yt-surface h-4 w-full animate-pulse rounded"></div>
{/if}
