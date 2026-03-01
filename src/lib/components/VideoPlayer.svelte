<script lang="ts">
	/**
	 * @fileoverview VideoPlayer component that embeds a YouTube video via iframe.
	 * @component
	 *
	 * Uses youtube.com/embed (the standard embed URL) rather than youtube.com/shorts.
	 * This is the core of the "Shortless" experience: even if the original video is a
	 * YouTube Short, embedding via /embed always renders it in the regular player UI
	 * with full controls (seek bar, fullscreen, speed controls, etc.), bypassing the
	 * vertical Shorts player entirely.
	 *
	 * The `src` is a derived closure (not a plain derived value) because it depends on
	 * both videoId and startTime, and we need to call it in the template to get the
	 * current URL string.
	 *
	 * Query params:
	 * - autoplay=1: starts playback immediately when the page loads
	 * - rel=0: limits related videos at the end to the same channel
	 * - start=N: (optional) seeks to a specific second, used by chapter navigation
	 */

	/** @prop videoId - The YouTube video ID to embed */
	/** @prop startTime - Optional start time in seconds, set when clicking a chapter timestamp */
	let { videoId, startTime }: { videoId: string; startTime?: number } = $props();

	/**
	 * Derived closure that builds the embed URL. Returns a function because $derived
	 * captures the reactive expression, and we invoke it in the template with src().
	 * Automatically recomputes when videoId or startTime changes (e.g., chapter click).
	 */
	let src = $derived(() => {
		let url = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
		if (startTime && startTime > 0) {
			/* Floor the seconds value to avoid fractional timestamps in the URL */
			url += `&start=${Math.floor(startTime)}`;
		}
		return url;
	});
</script>

<!-- 16:9 aspect-ratio container with black background (visible before the iframe loads) -->
<div class="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
	<iframe
		src={src()}
		title="Video player"
		class="absolute inset-0 h-full w-full"
		frameborder="0"
		allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
		allowfullscreen
	></iframe>
</div>
