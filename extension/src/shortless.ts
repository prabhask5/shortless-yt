/**
 * @file shortless.ts — Content script for the Shortless YouTube extension.
 *
 * Removes all traces of YouTube Shorts from the YouTube website through
 * three complementary phases:
 *   1. Immediate URL redirect (runs at document_start before page renders)
 *   2. MutationObserver-based DOM cleanup (runs when DOM is ready)
 *   3. SPA navigation interception (catches client-side route changes)
 *
 * Injected at "document_start" so Phase 1 fires before any rendering occurs.
 */

// YouTube custom events carry navigation data in their detail property.
interface YTNavigateEvent extends Event {
	detail?: {
		url?: string;
	};
}

// =============================================================================
// Phase 1: Immediate URL Redirect
// =============================================================================
// This block runs synchronously at document_start — before the DOM exists —
// so the user never sees a Shorts page flash on screen.

/**
 * Regex that matches YouTube Shorts URLs and captures the video ID.
 * Covers paths like /shorts/dQw4w9WgXcQ and /shorts/dQw4w9WgXcQ?feature=share
 */
const SHORTS_PATH_RE: RegExp = /^\/shorts\/([a-zA-Z0-9_-]{11})/;

/**
 * Check the current URL and redirect /shorts/VIDEO_ID to /watch?v=VIDEO_ID.
 * Uses location.replace() so the Shorts URL does not remain in browser history.
 */
(function immediateRedirect(): void {
	const match: RegExpMatchArray | null = location.pathname.match(SHORTS_PATH_RE);
	if (match) {
		location.replace('/watch?v=' + match[1]);
	}
})();

/**
 * YouTube fires a custom `yt-navigate-start` event on the document when its
 * SPA router begins a navigation. We intercept this to catch Shorts navigations
 * that happen *before* the URL actually changes, giving us the earliest possible
 * moment to redirect within the SPA lifecycle.
 */
document.addEventListener('yt-navigate-start', (e: Event) => {
	try {
		const ytEvent = e as YTNavigateEvent;
		const url: string | undefined = ytEvent.detail?.url;
		if (typeof url === 'string') {
			const match: RegExpMatchArray | null = url.match(SHORTS_PATH_RE);
			if (match) {
				location.replace('/watch?v=' + match[1]);
			}
		}
	} catch (_) {
		// Silently ignore — defensive against unexpected event shapes
	}
});

// =============================================================================
// Phase 2: MutationObserver DOM Cleanup
// =============================================================================
// Once the DOM is available we observe it for Shorts-related elements and remove
// them. This handles elements that the CSS `:has()` rules in shortless.css might
// miss in older Chromium builds or when YouTube uses localized "Shorts" text.

/** Debounce timer ID for batching cleanup passes. */
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounce interval in milliseconds. Mutations are batched into cleanup passes
 * at most once per this interval to avoid layout thrashing on heavy page loads.
 */
const DEBOUNCE_MS: number = 150;

/** Prevents our own DOM changes from re-triggering cleanup. */
let isRunningCleanup: boolean = false;

/**
 * Helper to hide an HTMLElement by setting display to none.
 */
function hideElement(el: HTMLElement): void {
	el.style.display = 'none';
}

/**
 * Run a single cleanup pass over the current DOM, removing or hiding any
 * Shorts-related elements that CSS alone cannot reliably target.
 */
function runCleanupPass(): void {
	isRunningCleanup = true;
	try {
		// ---- Shorts in "Up next" sidebar ----
		const compactOverlays: NodeListOf<HTMLElement> = document.querySelectorAll(
			'ytd-compact-video-renderer [overlay-style="SHORTS"]'
		);
		for (const overlay of compactOverlays) {
			const renderer: HTMLElement | null = overlay.closest('ytd-compact-video-renderer');
			if (renderer) hideElement(renderer);
		}

		// ---- Sidebar navigation "Shorts" entry ----
		const guideEntries: NodeListOf<HTMLElement> = document.querySelectorAll(
			'ytd-guide-entry-renderer'
		);
		for (const entry of guideEntries) {
			const title: Element | null = entry.querySelector('yt-formatted-string');
			if (title && /\bShorts\b/i.test(title.textContent || '')) {
				hideElement(entry);
			}
		}

		// Also handle the mini-guide (collapsed sidebar) entries
		const miniGuideEntries: NodeListOf<HTMLElement> = document.querySelectorAll(
			'ytd-mini-guide-entry-renderer'
		);
		for (const entry of miniGuideEntries) {
			const label: Element | null = entry.querySelector(
				'.yt-spec-button-shape-next--button-text-content, .title'
			);
			if (label && /\bShorts\b/i.test(label.textContent || '')) {
				hideElement(entry);
			}
		}

		// ---- Channel tab strip Shorts tab ----
		const tabs: NodeListOf<HTMLElement> = document.querySelectorAll(
			"yt-tab-shape, tp-yt-paper-tab, yt-tab-group-shape [role='tab']"
		);
		for (const tab of tabs) {
			if (/\bShorts\b/i.test(tab.textContent || '')) {
				hideElement(tab);
			}
		}

		// ---- Shorts filter chips ----
		const chips: NodeListOf<HTMLElement> = document.querySelectorAll(
			'yt-chip-cloud-chip-renderer, ytd-search-filter-renderer, chip-view-model'
		);
		for (const chip of chips) {
			if (/\bShorts\b/i.test(chip.textContent || '')) {
				hideElement(chip);
			}
		}

		// ---- Notification dropdown items linking to /shorts/ ----
		const notificationItems: NodeListOf<HTMLElement> = document.querySelectorAll(
			'ytd-notification-renderer'
		);
		for (const item of notificationItems) {
			const anchor: Element | null = item.querySelector("a[href*='/shorts/']");
			if (anchor) {
				hideElement(item);
			}
		}

		// ---- Individual Shorts detected by /shorts/ link href ----
		const shortsLinks: NodeListOf<HTMLAnchorElement> = document.querySelectorAll(
			"ytd-video-renderer a[href*='/shorts/'], ytd-grid-video-renderer a[href*='/shorts/'], ytd-rich-item-renderer a[href*='/shorts/'], ytd-compact-video-renderer a[href*='/shorts/']"
		);
		for (const link of shortsLinks) {
			const renderer: HTMLElement | null = link.closest(
				'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer'
			);
			if (renderer) hideElement(renderer);
		}

		// ---- Shorts shelves on the home feed ----
		const shortsShelves: NodeListOf<HTMLElement> = document.querySelectorAll(
			'ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]'
		);
		for (const shelf of shortsShelves) {
			hideElement(shelf);
		}

		// ---- "Latest Shorts from [CHANNEL]" in search results ----
		const shortsLockups: NodeListOf<HTMLElement> = document.querySelectorAll(
			'grid-shelf-view-model ytm-shorts-lockup-view-model'
		);
		for (const lockup of shortsLockups) {
			const shelf: HTMLElement | null = lockup.closest('grid-shelf-view-model');
			if (shelf) hideElement(shelf);
		}
	} finally {
		isRunningCleanup = false;
	}
}

/**
 * Schedule a debounced cleanup pass. Multiple rapid DOM mutations (e.g. during
 * initial page load) are collapsed into a single pass that runs after the
 * mutations settle, avoiding excessive reflows.
 */
function scheduleCleanup(): void {
	if (cleanupTimer !== null) {
		clearTimeout(cleanupTimer);
	}
	cleanupTimer = setTimeout(() => {
		cleanupTimer = null;
		runCleanupPass();
	}, DEBOUNCE_MS);
}

/**
 * Initialise the MutationObserver once the DOM is interactive.
 * We observe the entire document tree for child-list changes so we catch
 * dynamically loaded Shorts content (infinite scroll, navigation, etc.).
 */
function initObserver(): void {
	const observer = new MutationObserver(() => {
		if (!isRunningCleanup) {
			scheduleCleanup();
		}
	});

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true
	});

	runCleanupPass();
}

// Wait for the DOM to be ready. Since this script runs at document_start,
// the DOM may not exist yet.
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initObserver, { once: true });
} else {
	initObserver();
}

// =============================================================================
// Phase 2b: Shorts Player Scroll/Swipe Blocking
// =============================================================================
// When the user lands on a Shorts player page (via /watch?v= for a Short),
// block the vertical scroll/swipe that navigates to the next Short. This
// makes the Shorts player behave like a single video player.

/**
 * Check if the current page is a Shorts player page.
 */
function isShortsPlayerPage(): boolean {
	const pageManager: Element | null = document.querySelector('ytd-page-manager');
	if (pageManager && pageManager.getAttribute('page-subtype') === 'shorts') {
		return true;
	}
	return !!document.querySelector('ytd-shorts');
}

/**
 * Block scroll/swipe events that navigate between Shorts.
 * Only active when on a Shorts player page.
 */
function blockShortsScroll(e: Event): void {
	if (!isShortsPlayerPage()) return;
	e.stopPropagation();
	e.preventDefault();
}

/**
 * Block arrow keys that navigate between Shorts.
 */
function blockShortsKeys(e: KeyboardEvent): void {
	if (!isShortsPlayerPage()) return;
	const blocked: string[] = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'];
	if (blocked.includes(e.key)) {
		e.stopPropagation();
		e.preventDefault();
	}
}

// Use capture phase to intercept before YouTube's handlers
document.addEventListener('wheel', blockShortsScroll, { passive: false, capture: true });
document.addEventListener('touchmove', blockShortsScroll, { passive: false, capture: true });
document.addEventListener('keydown', blockShortsKeys, { passive: false, capture: true });

// =============================================================================
// Phase 3: SPA Navigation Handling
// =============================================================================
// YouTube is a single-page application — full page loads are rare after the
// initial visit. We need to handle two SPA navigation vectors:
//   A. YouTube's own `yt-navigate-finish` custom event (fires after SPA nav)
//   B. Monkey-patched history.pushState / replaceState to intercept /shorts/
//      navigations that bypass YouTube's custom events

/**
 * After a YouTube SPA navigation completes, check the new URL and re-run
 * cleanup. The `yt-navigate-finish` event fires after the new page content
 * has been inserted into the DOM.
 */
document.addEventListener('yt-navigate-finish', () => {
	const match: RegExpMatchArray | null = location.pathname.match(SHORTS_PATH_RE);
	if (match) {
		location.replace('/watch?v=' + match[1]);
		return;
	}
	scheduleCleanup();
});

/**
 * Monkey-patch history.pushState and history.replaceState to intercept any
 * programmatic navigation to /shorts/ URLs. This is a safety net that catches
 * navigations which might not fire YouTube's custom events.
 */
(function patchHistoryMethods(): void {
	const originalPushState = history.pushState.bind(history);
	const originalReplaceState = history.replaceState.bind(history);

	type HistoryMethod = typeof history.pushState;

	/**
	 * Create a wrapped version of a history method that intercepts /shorts/ URLs.
	 */
	function createPatchedMethod(originalMethod: HistoryMethod): HistoryMethod {
		return function patchedHistoryMethod(
			state: unknown,
			unused: string,
			url?: string | URL | null
		): void {
			if (typeof url === 'string') {
				const match: RegExpMatchArray | null = url.match(SHORTS_PATH_RE);
				if (match) {
					const rewritten: string = '/watch?v=' + match[1];
					return originalMethod(state, unused, rewritten);
				}
				try {
					const parsed = new URL(url, location.origin);
					const fullMatch: RegExpMatchArray | null = parsed.pathname.match(SHORTS_PATH_RE);
					if (fullMatch) {
						parsed.pathname = '/watch';
						parsed.searchParams.set('v', fullMatch[1]);
						return originalMethod(state, unused, parsed.toString());
					}
				} catch (_) {
					// Not a valid URL — pass through
				}
			}
			return originalMethod(state, unused, url);
		};
	}

	history.pushState = createPatchedMethod(originalPushState);
	history.replaceState = createPatchedMethod(originalReplaceState);
})();
