<script lang="ts">
	/**
	 * @fileoverview Mobile-only refresh button styled like YouTube's native UI.
	 *
	 * Replaces broken pull-to-refresh with a tap-to-refresh pill button that
	 * appears at the top of the screen on mobile (<=640px). Matches YouTube's
	 * "New posts available" / refresh prompt design language.
	 *
	 * The button hides when scrolling down and reappears when scrolling up
	 * or when the user is near the top of the page.
	 */
	import type { Snippet } from 'svelte';

	let { onRefresh, children }: { onRefresh: () => Promise<void>; children: Snippet } = $props();

	let refreshing = $state(false);
	let visible = $state(true);
	let lastScrollY = $state(0);

	async function handleRefresh() {
		if (refreshing) return;
		refreshing = true;
		try {
			await onRefresh();
			/* Scroll to top on successful refresh like YouTube does */
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} finally {
			refreshing = false;
		}
	}

	function handleScroll() {
		const y = window.scrollY;
		if (y <= 10) {
			visible = true;
		} else if (y < lastScrollY - 3) {
			visible = true;
		} else if (y > lastScrollY + 8) {
			visible = false;
		}
		lastScrollY = y;
	}
</script>

<svelte:window onscroll={handleScroll} />

{@render children()}

<!-- Mobile-only refresh pill -->
<button
	class="refresh-pill"
	class:hidden={!visible}
	class:loading={refreshing}
	onclick={handleRefresh}
	disabled={refreshing}
	aria-label="Refresh feed"
>
	<svg
		class="refresh-pill-icon"
		class:spin={refreshing}
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M21 12a9 9 0 1 1-6.219-8.56" />
		<path d="M21 3v6h-6" />
	</svg>
	<span class="refresh-pill-label">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
</button>

<style>
	/* Hidden on desktop — mobile only */
	.refresh-pill {
		display: none;
	}

	@media (max-width: 640px) {
		.refresh-pill {
			position: fixed;
			bottom: 1.5rem;
			left: 50%;
			z-index: 50;
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 10px 20px;
			border: none;
			border-radius: 999px;
			background: var(--color-yt-surface);
			color: var(--color-yt-text);
			font-family: 'Roboto', sans-serif;
			font-size: 14px;
			font-weight: 500;
			letter-spacing: 0.01em;
			white-space: nowrap;
			box-shadow:
				0 4px 14px rgba(0, 0, 0, 0.35),
				0 1px 3px rgba(0, 0, 0, 0.2);
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
			/* Animation */
			transform: translateX(-50%) translateY(0);
			opacity: 1;
			transition:
				transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
				opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1),
				background 0.15s ease,
				box-shadow 0.15s ease;
		}

		.refresh-pill:active:not(:disabled) {
			background: var(--color-yt-surface-hover);
			transform: translateX(-50%) scale(0.95);
		}

		.refresh-pill:disabled {
			cursor: default;
		}

		/* Hide state — slides down off-screen */
		.refresh-pill.hidden {
			transform: translateX(-50%) translateY(calc(100% + 3rem));
			opacity: 0;
			pointer-events: none;
		}

		/* Loading state — subtle accent tint */
		.refresh-pill.loading {
			color: var(--color-yt-text);
		}

		.refresh-pill-icon {
			flex-shrink: 0;
		}

		.refresh-pill-icon.spin {
			animation: spin 0.7s linear infinite;
		}

		.refresh-pill-label {
			line-height: 1;
		}

		@keyframes spin {
			to {
				transform: rotate(360deg);
			}
		}
	}
</style>
