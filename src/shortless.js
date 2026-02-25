/**
 * @file shortless.js — Content script for the Shortless YouTube extension.
 *
 * Removes all traces of YouTube Shorts from the YouTube website through
 * three complementary phases:
 *   1. Immediate URL redirect (runs at document_start before page renders)
 *   2. MutationObserver-based DOM cleanup (runs when DOM is ready)
 *   3. SPA navigation interception (catches client-side route changes)
 *
 * Injected at "document_start" so Phase 1 fires before any rendering occurs.
 */

// =============================================================================
// Phase 1: Immediate URL Redirect
// =============================================================================
// This block runs synchronously at document_start — before the DOM exists —
// so the user never sees a Shorts page flash on screen.

/**
 * Regex that matches YouTube Shorts URLs and captures the video ID.
 * Covers paths like /shorts/dQw4w9WgXcQ and /shorts/dQw4w9WgXcQ?feature=share
 * @type {RegExp}
 */
const SHORTS_PATH_RE = /^\/shorts\/([a-zA-Z0-9_-]{11})/;

/**
 * Check the current URL and redirect /shorts/VIDEO_ID to /watch?v=VIDEO_ID.
 * Uses location.replace() so the Shorts URL does not remain in browser history.
 */
(function immediateRedirect() {
  const match = location.pathname.match(SHORTS_PATH_RE);
  if (match) {
    const videoId = match[1];
    // replace() avoids a back-button loop — the Shorts URL is removed from history
    location.replace("/watch?v=" + videoId);
  }
})();

/**
 * YouTube fires a custom `yt-navigate-start` event on the document when its
 * SPA router begins a navigation. We intercept this to catch Shorts navigations
 * that happen *before* the URL actually changes, giving us the earliest possible
 * moment to redirect within the SPA lifecycle.
 *
 * @param {CustomEvent} e — The yt-navigate-start event. `e.detail` contains
 *   a `url` property with the target path.
 */
document.addEventListener("yt-navigate-start", (e) => {
  try {
    const url = e.detail && e.detail.url;
    if (typeof url === "string") {
      const match = url.match(SHORTS_PATH_RE);
      if (match) {
        const videoId = match[1];
        // Navigate to the regular watch page instead
        location.replace("/watch?v=" + videoId);
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

/**
 * Debounce timer ID for batching cleanup passes.
 * @type {number|null}
 */
let cleanupTimer = null;

/**
 * Debounce interval in milliseconds. Mutations are batched into cleanup passes
 * at most once per this interval to avoid layout thrashing on heavy page loads.
 * @type {number}
 */
const DEBOUNCE_MS = 150;

/**
 * Run a single cleanup pass over the current DOM, removing or hiding any
 * Shorts-related elements that CSS alone cannot reliably target.
 *
 * Targets include:
 *   - Shorts in the "Up next" sidebar (compact video renderers with Shorts overlay)
 *   - Sidebar navigation entries containing "Shorts" text
 *   - Channel page tab strip entries for Shorts
 *   - Shorts filter/chip buttons
 *   - Notification menu items linking to /shorts/
 */
/** @type {boolean} — Prevents our own DOM changes from re-triggering cleanup. */
let isRunningCleanup = false;

function runCleanupPass() {
  isRunningCleanup = true;
  try {
  // ---- Shorts in "Up next" sidebar ----
  // YouTube marks Shorts with an overlay badge inside compact renderers.
  // The overlay element has `[overlay-style="SHORTS"]` or contains "SHORTS" text.
  /** @type {NodeListOf<HTMLElement>} */
  const compactRenderers = document.querySelectorAll(
    'ytd-compact-video-renderer [overlay-style="SHORTS"]'
  );
  for (const overlay of compactRenderers) {
    // Walk up to the renderer root and hide the entire card
    const renderer = overlay.closest("ytd-compact-video-renderer");
    if (renderer) {
      renderer.style.display = "none";
    }
  }

  // ---- Sidebar navigation "Shorts" entry ----
  // The guide (left sidebar) has <ytd-guide-entry-renderer> items. We look for
  // ones whose text content includes "Shorts". This is a fallback for browsers
  // or locales where the CSS :has() selector is insufficient.
  /** @type {NodeListOf<HTMLElement>} */
  const guideEntries = document.querySelectorAll("ytd-guide-entry-renderer");
  for (const entry of guideEntries) {
    const title = entry.querySelector("yt-formatted-string");
    if (title && /\bShorts\b/i.test(title.textContent || "")) {
      entry.style.display = "none";
    }
  }

  // Also handle the mini-guide (collapsed sidebar) entries
  /** @type {NodeListOf<HTMLElement>} */
  const miniGuideEntries = document.querySelectorAll(
    "ytd-mini-guide-entry-renderer"
  );
  for (const entry of miniGuideEntries) {
    const label = entry.querySelector(".yt-spec-button-shape-next--button-text-content, .title");
    if (label && /\bShorts\b/i.test(label.textContent || "")) {
      entry.style.display = "none";
    }
  }

  // ---- Channel tab strip Shorts tab ----
  // On channel pages, tabs are rendered inside <yt-tab-shape> or
  // <tp-yt-paper-tab> elements. Hide the one labelled "Shorts".
  /** @type {NodeListOf<HTMLElement>} */
  const tabs = document.querySelectorAll(
    "yt-tab-shape, tp-yt-paper-tab, yt-tab-group-shape [role='tab']"
  );
  for (const tab of tabs) {
    if (/\bShorts\b/i.test(tab.textContent || "")) {
      tab.style.display = "none";
    }
  }

  // ---- Shorts filter chips ----
  // The chip bar on search results / home feed uses <yt-chip-cloud-chip-renderer>.
  /** @type {NodeListOf<HTMLElement>} */
  const chips = document.querySelectorAll(
    "yt-chip-cloud-chip-renderer, ytd-search-filter-renderer, chip-view-model"
  );
  for (const chip of chips) {
    if (/\bShorts\b/i.test(chip.textContent || "")) {
      chip.style.display = "none";
    }
  }

  // ---- Notification dropdown items linking to /shorts/ ----
  // Notification entries contain anchor tags; hide any that point to /shorts/.
  /** @type {NodeListOf<HTMLElement>} */
  const notificationItems = document.querySelectorAll(
    "ytd-notification-renderer"
  );
  for (const item of notificationItems) {
    const anchor = item.querySelector("a[href*='/shorts/']");
    if (anchor) {
      item.style.display = "none";
    }
  }

  // ---- Shorts shelves on the home feed ----
  // YouTube renders entire Shorts shelves as <ytd-rich-shelf-renderer> or
  // <ytd-reel-shelf-renderer>. Hide the whole shelf.
  /** @type {NodeListOf<HTMLElement>} */
  const shortsShelves = document.querySelectorAll(
    "ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]"
  );
  for (const shelf of shortsShelves) {
    shelf.style.display = "none";
  }

  // ---- "Latest Shorts from [CHANNEL]" in search results ----
  // These use a <grid-shelf-view-model> containing ytm-shorts-lockup-view-model
  // items. Hide the grid-shelf-view-model itself (NOT the parent section,
  // which contains all search results).
  /** @type {NodeListOf<HTMLElement>} */
  const shortsLockups = document.querySelectorAll(
    "grid-shelf-view-model ytm-shorts-lockup-view-model"
  );
  for (const lockup of shortsLockups) {
    const shelf = lockup.closest("grid-shelf-view-model");
    if (shelf) {
      shelf.style.display = "none";
    }
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
function scheduleCleanup() {
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
function initObserver() {
  const observer = new MutationObserver(() => {
    // Ignore mutations caused by our own hide() calls to prevent infinite loops.
    if (!isRunningCleanup) {
      scheduleCleanup();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Run one immediate cleanup for any Shorts content already in the DOM
  runCleanupPass();
}

// Wait for the DOM to be ready. Since this script runs at document_start,
// the DOM may not exist yet.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initObserver, { once: true });
} else {
  // DOM is already interactive or complete
  initObserver();
}

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
document.addEventListener("yt-navigate-finish", () => {
  // Check if we somehow ended up on a Shorts page despite Phase 1
  const match = location.pathname.match(SHORTS_PATH_RE);
  if (match) {
    location.replace("/watch?v=" + match[1]);
    return;
  }
  // Re-run cleanup for the newly loaded page content
  scheduleCleanup();
});

/**
 * Monkey-patch history.pushState and history.replaceState to intercept any
 * programmatic navigation to /shorts/ URLs. This is a safety net that catches
 * navigations which might not fire YouTube's custom events.
 *
 * We store references to the original methods and wrap them with a check.
 */
(function patchHistoryMethods() {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  /**
   * Create a wrapped version of a history method that intercepts /shorts/ URLs.
   *
   * @param {typeof history.pushState} originalMethod — The original history method
   * @param {string} methodName — "pushState" or "replaceState" (for debugging)
   * @returns {typeof history.pushState} — The wrapped method
   */
  function createPatchedMethod(originalMethod, methodName) {
    return function patchedHistoryMethod(state, unused, url) {
      if (typeof url === "string") {
        const match = url.match(SHORTS_PATH_RE);
        if (match) {
          // Rewrite the URL to /watch?v=VIDEO_ID before it hits the history API
          const rewritten = "/watch?v=" + match[1];
          return originalMethod(state, unused, rewritten);
        }
        // Also handle full URLs (https://www.youtube.com/shorts/...)
        try {
          const parsed = new URL(url, location.origin);
          const fullMatch = parsed.pathname.match(SHORTS_PATH_RE);
          if (fullMatch) {
            parsed.pathname = "/watch";
            parsed.searchParams.set("v", fullMatch[1]);
            return originalMethod(state, unused, parsed.toString());
          }
        } catch (_) {
          // Not a valid URL — pass through
        }
      }
      // No Shorts URL detected — call the original method unchanged
      return originalMethod(state, unused, url);
    };
  }

  history.pushState = createPatchedMethod(originalPushState, "pushState");
  history.replaceState = createPatchedMethod(
    originalReplaceState,
    "replaceState"
  );
})();
