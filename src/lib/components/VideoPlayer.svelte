<script lang="ts">
	let { videoId, startTime }: { videoId: string; startTime?: number } = $props();

	let src = $derived(() => {
		let url = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
		if (startTime && startTime > 0) {
			url += `&start=${Math.floor(startTime)}`;
		}
		return url;
	});
</script>

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
