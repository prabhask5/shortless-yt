<script lang="ts">
	import type { Snippet } from 'svelte';

	let { onRefresh, children }: { onRefresh: () => Promise<void>; children: Snippet } = $props();

	let pullDistance = $state(0);
	let isRefreshing = $state(false);
	let startY = $state(0);
	let isPulling = $state(false);

	const THRESHOLD = 80;
	const MAX_PULL = 120;

	function handleTouchStart(e: TouchEvent) {
		if (window.scrollY === 0 && !isRefreshing) {
			startY = e.touches[0].clientY;
			isPulling = true;
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isPulling || isRefreshing) return;

		const currentY = e.touches[0].clientY;
		const diff = currentY - startY;

		if (diff > 0 && window.scrollY === 0) {
			pullDistance = Math.min(diff * 0.5, MAX_PULL);
			if (pullDistance > 10) {
				e.preventDefault();
			}
		}
	}

	async function handleTouchEnd() {
		if (!isPulling) return;
		isPulling = false;

		if (pullDistance >= THRESHOLD && !isRefreshing) {
			isRefreshing = true;
			pullDistance = THRESHOLD * 0.6;
			try {
				await onRefresh();
			} finally {
				isRefreshing = false;
				pullDistance = 0;
			}
		} else {
			pullDistance = 0;
		}
	}

	let showIndicator = $derived(pullDistance > 10 || isRefreshing);
	let rotation = $derived(Math.min((pullDistance / THRESHOLD) * 360, 360));
	let opacity = $derived(Math.min(pullDistance / THRESHOLD, 1));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	class="relative"
>
	{#if showIndicator}
		<div
			class="pointer-events-none absolute left-1/2 z-40 flex -translate-x-1/2 items-center justify-center"
			style="top: {pullDistance - 40}px; opacity: {opacity}"
		>
			<div class="bg-yt-surface flex h-10 w-10 items-center justify-center rounded-full shadow-lg">
				{#if isRefreshing}
					<div
						class="border-yt-text-secondary border-t-yt-accent h-5 w-5 animate-spin rounded-full border-2"
					></div>
				{:else}
					<svg
						class="text-yt-text-secondary h-5 w-5"
						style="transform: rotate({rotation}deg)"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
					</svg>
				{/if}
			</div>
		</div>
	{/if}

	<div style={pullDistance > 10 ? `transform: translateY(${pullDistance}px)` : ''}>
		{@render children()}
	</div>
</div>
