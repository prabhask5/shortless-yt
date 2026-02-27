<script lang="ts">
	/**
	 * @fileoverview PullToRefresh component for mobile touch-based content refresh.
	 * @component
	 *
	 * Wraps page content and intercepts downward touch gestures when the user is
	 * scrolled to the top of the page. Pulling down reveals a circular indicator
	 * that rotates proportionally to the pull distance. Releasing past the threshold
	 * triggers the refresh callback.
	 *
	 * Touch gesture math:
	 * - THRESHOLD (80px): The minimum pull distance required to trigger a refresh.
	 *   Pulling less than this and releasing snaps back without refreshing.
	 * - MAX_PULL (120px): The maximum visual pull distance. Prevents the user from
	 *   dragging the content too far down the screen.
	 * - Damping factor (0.5): The actual pull distance is multiplied by 0.5, so the
	 *   user must drag 160px to reach the 80px threshold. This creates a "rubber band"
	 *   feel where the content moves slower than the finger, matching native mobile UX.
	 *
	 * Refresh lifecycle:
	 * 1. Touch starts at top of page -> isPulling = true, record startY
	 * 2. Touch moves down -> pullDistance increases (with 0.5x damping, capped at MAX_PULL)
	 * 3. Touch ends:
	 *    a. If pullDistance >= THRESHOLD: set isRefreshing=true, shrink indicator to 60%
	 *       of threshold, call onRefresh(), wait for it to complete, then reset
	 *    b. If pullDistance < THRESHOLD: snap back immediately (pullDistance = 0)
	 *
	 * The indicator arrow rotates up to 360 degrees as the user pulls, and switches
	 * to a spinning animation once the refresh is in progress.
	 */
	import type { Snippet } from 'svelte';

	/** @prop onRefresh - Async callback to execute when the pull-to-refresh is triggered */
	/** @prop children - The page content to wrap (rendered via Svelte snippet) */
	let { onRefresh, children }: { onRefresh: () => Promise<void>; children: Snippet } = $props();

	/** Current pull distance in pixels (after damping), controls indicator position */
	let pullDistance = $state(0);
	/** Whether the refresh callback is currently executing */
	let isRefreshing = $state(false);
	/** The Y coordinate where the touch gesture started */
	let startY = $state(0);
	/** Whether the user is actively pulling (touch is down and moving) */
	let isPulling = $state(false);

	/** Minimum pull distance (px) to trigger a refresh on release */
	const THRESHOLD = 80;
	/** Maximum visual pull distance (px) to prevent over-pulling */
	const MAX_PULL = 120;

	/**
	 * Records the touch start position if the page is scrolled to the top.
	 * Only activates pull-to-refresh when window.scrollY === 0, so normal
	 * scrolling within the page is not intercepted.
	 * @param e - The touchstart event
	 */
	function handleTouchStart(e: TouchEvent) {
		if (window.scrollY === 0 && !isRefreshing) {
			startY = e.touches[0].clientY;
			isPulling = true;
		}
	}

	/**
	 * Tracks the touch movement and updates the pull distance.
	 * The 0.5x damping factor creates a rubber-band resistance effect.
	 * Calls preventDefault() once pullDistance > 10px to prevent the browser's
	 * native scroll/bounce behavior from interfering.
	 * @param e - The touchmove event
	 */
	function handleTouchMove(e: TouchEvent) {
		if (!isPulling || isRefreshing) return;

		const currentY = e.touches[0].clientY;
		const diff = currentY - startY;

		if (diff > 0 && window.scrollY === 0) {
			/* Apply 0.5x damping and cap at MAX_PULL for rubber-band feel */
			pullDistance = Math.min(diff * 0.5, MAX_PULL);
			if (pullDistance > 10) {
				e.preventDefault();
			}
		}
	}

	/**
	 * Handles the touch release. If the pull exceeded the threshold, triggers
	 * the refresh and holds the indicator at a reduced size (60% of threshold)
	 * during the async operation. Otherwise snaps back immediately.
	 */
	async function handleTouchEnd() {
		if (!isPulling) return;
		isPulling = false;

		if (pullDistance >= THRESHOLD && !isRefreshing) {
			isRefreshing = true;
			/* Shrink to 60% of threshold during refresh to keep indicator visible but compact */
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

	/** Show the indicator when actively pulling (past 10px deadzone) or during refresh */
	let showIndicator = $derived(pullDistance > 10 || isRefreshing);
	/** Arrow rotation in degrees: 0 at rest, up to 360 at the threshold */
	let rotation = $derived(Math.min((pullDistance / THRESHOLD) * 360, 360));
	/** Indicator opacity: fades in from 0 to 1 as pull approaches the threshold */
	let opacity = $derived(Math.min(pullDistance / THRESHOLD, 1));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	class="relative"
>
	<!-- Pull indicator: a floating circle that follows the pull distance.
	     Positioned at pullDistance - 40px so it emerges from above the content edge.
	     pointer-events-none prevents it from intercepting touch events. -->
	{#if showIndicator}
		<div
			class="pointer-events-none absolute left-1/2 z-40 flex -translate-x-1/2 items-center justify-center"
			style="top: {pullDistance - 40}px; opacity: {opacity}"
		>
			<div class="bg-yt-surface flex h-10 w-10 items-center justify-center rounded-full shadow-lg">
				<!-- During refresh: spinning border animation. Before release: rotating arrow. -->
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

	<!-- Content wrapper: translateY pushes the content down to match the pull distance,
	     creating the visual effect of "pulling" the page content down. Only applied
	     past the 10px deadzone to avoid micro-shifts during normal touch interactions. -->
	<div style={pullDistance > 10 ? `transform: translateY(${pullDistance}px)` : ''}>
		{@render children()}
	</div>
</div>
