/**
 * @file shortless.js — Content script for the Shortless YouTube extension.
 *
 * Removes all traces of YouTube Shorts from the YouTube website through
 * three complementary phases:
 *   1. Immediate URL redirect (runs at document_start before page renders)
 *   2. MutationObserver-based DOM cleanup (runs when DOM is ready)
 *   3. SPA navigation interception (catches client-side route changes)
 *
 * Performance: The CSS file handles ~95% of hiding. This JS is a fallback
 * for elements CSS :has() can't catch (localized text, dynamic attributes).
 * Cleanup runs immediately after navigation, then debounces to 150ms batches.
 * Only queries the DOM for elements that CSS might miss — avoids redundant work.
 */

// =============================================================================
// Phase 1: Immediate URL Redirect
// =============================================================================

/**
 * Regex matching /shorts/VIDEO_ID paths. Captures the video ID.
 * @type {RegExp}
 */
const SHORTS_PATH_RE = /^\/shorts\/([a-zA-Z0-9_-]{11})/;

/**
 * Redirect /shorts/ URLs to /watch?v= immediately at document_start.
 */
(function immediateRedirect() {
  const match = location.pathname.match(SHORTS_PATH_RE);
  if (match) {
    location.replace("/watch?v=" + match[1]);
  }
})();

/**
 * Intercept YouTube SPA navigation start events for /shorts/ URLs.
 */
document.addEventListener("yt-navigate-start", (e) => {
  try {
    const url = e.detail && e.detail.url;
    if (typeof url === "string") {
      const match = url.match(SHORTS_PATH_RE);
      if (match) {
        location.replace("/watch?v=" + match[1]);
      }
    }
  } catch (_) {}
});

// =============================================================================
// Phase 2: MutationObserver DOM Cleanup
// =============================================================================
// The CSS handles most hiding via attribute selectors and :has(). This JS
// layer catches what CSS can't: text-content matching for localized "Shorts"
// labels, and elements without reliable attributes. We keep queries minimal
// and avoid touching elements the CSS already handles.

/** @type {number|null} */
let cleanupTimer = null;

/** @type {boolean} — First cleanup after navigation runs immediately. */
let needsImmediateCleanup = true;

/** @type {number} */
const DEBOUNCE_MS = 150;

/**
 * Detect if we're on mobile YouTube (m.youtube.com).
 * Cached once to avoid repeated hostname checks.
 * @type {boolean}
 */
const isMobile = location.hostname === "m.youtube.com";

/**
 * Hide an element. No-ops if already hidden or null.
 * @param {HTMLElement|null} el
 */
function hide(el) {
  if (el && el.style.display !== "none") {
    el.style.display = "none";
  }
}

/**
 * Run cleanup. Only queries for elements that CSS :has() might miss:
 * - Text-content based matching (for localized "Shorts" labels)
 * - Overlay badge matching (fallback for browsers without :has())
 * - Mobile section containers with Shorts content
 *
 * Splits into desktop vs mobile paths to avoid unnecessary DOM queries.
 */
function runCleanupPass() {
  isRunningCleanup = true;
  try {
    if (isMobile) {
      runMobileCleanup();
    } else {
      runDesktopCleanup();
    }
  } finally {
    isRunningCleanup = false;
  }
}

/**
 * Desktop cleanup — targets elements CSS can't reliably catch.
 */
function runDesktopCleanup() {
  // Shorts by overlay badge — fallback for browsers without :has()
  const overlays = document.querySelectorAll('[overlay-style="SHORTS"]');
  for (const overlay of overlays) {
    hide(overlay.closest(
      "ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer"
    ));
  }

  // Sidebar "Shorts" entries — text match catches localized labels
  const guideEntries = document.querySelectorAll(
    "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer"
  );
  for (const entry of guideEntries) {
    if (/\bShorts\b/i.test(entry.textContent || "")) {
      hide(entry);
    }
  }

  // Channel tabs & search tabs — text match for "Shorts"
  const tabs = document.querySelectorAll(
    "yt-tab-shape, tp-yt-paper-tab"
  );
  for (const tab of tabs) {
    if (/\bShorts\b/i.test(tab.textContent || "")) {
      hide(tab);
    }
  }

  // Filter chips — text match for "Shorts"
  const chips = document.querySelectorAll("yt-chip-cloud-chip-renderer");
  for (const chip of chips) {
    if (/\bShorts\b/i.test(chip.textContent || "")) {
      hide(chip);
    }
  }
}

/**
 * Mobile cleanup — hides individual Shorts elements only.
 * IMPORTANT: Never hide entire section containers (ytm-rich-section-renderer,
 * ytm-item-section-renderer) because YouTube puts regular videos and Shorts
 * in the SAME section. Hiding the section nukes all regular content.
 */
function runMobileCleanup() {
  // Individual Shorts lockup cards — hide the card and its direct rich-item wrapper
  const cards = document.querySelectorAll(
    "ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2"
  );
  for (const card of cards) {
    hide(card);
    hide(card.closest("ytm-rich-item-renderer"));
  }

  // Shorts shelves inside sections — hide the shelf, not the section
  const shelves = document.querySelectorAll(
    "ytm-reel-shelf-renderer, ytm-shorts-shelf-renderer"
  );
  for (const shelf of shelves) {
    hide(shelf);
  }

  // Shorts-styled video renderers
  const shortsVideos = document.querySelectorAll(
    'ytm-video-with-context-renderer:has([data-style="SHORTS"])'
  );
  for (const vid of shortsVideos) {
    hide(vid);
  }

  // Shorts section headers (so there's no orphaned "Shorts" title)
  const headers = document.querySelectorAll(
    ".shortsLockupViewModelHostHeaderText, .reel-shelf-header, .shorts-shelf-header"
  );
  for (const header of headers) {
    hide(header);
  }

  // Bottom nav "Shorts" tab
  const navItems = document.querySelectorAll("ytm-pivot-bar-item-renderer");
  for (const item of navItems) {
    if (
      item.querySelector('.pivot-shorts, a[href="/shorts"]') ||
      /\bShorts\b/i.test(item.textContent || "")
    ) {
      hide(item);
    }
  }

  // Mobile channel tabs
  const tabs = document.querySelectorAll("ytm-tab-renderer");
  for (const tab of tabs) {
    if (
      tab.querySelector('a[href*="/shorts"]') ||
      /\bShorts\b/i.test(tab.textContent || "")
    ) {
      hide(tab);
    }
  }
}

/**
 * Schedule cleanup. Immediate on first call after navigation, then debounced.
 */
function scheduleCleanup() {
  if (needsImmediateCleanup) {
    needsImmediateCleanup = false;
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    runCleanupPass();
    return;
  }
  if (cleanupTimer !== null) {
    clearTimeout(cleanupTimer);
  }
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    runCleanupPass();
  }, DEBOUNCE_MS);
}

/** @type {MutationObserver|null} */
let observer = null;

/** @type {boolean} — Prevents our own DOM changes from re-triggering cleanup. */
let isRunningCleanup = false;

/**
 * Start the MutationObserver when DOM is ready.
 */
function initObserver() {
  observer = new MutationObserver(() => {
    if (!isRunningCleanup) {
      scheduleCleanup();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  runCleanupPass();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initObserver, { once: true });
} else {
  initObserver();
}

// =============================================================================
// Phase 3: SPA Navigation Handling
// =============================================================================

document.addEventListener("yt-navigate-finish", () => {
  const match = location.pathname.match(SHORTS_PATH_RE);
  if (match) {
    location.replace("/watch?v=" + match[1]);
    return;
  }
  needsImmediateCleanup = true;
  scheduleCleanup();
});

/**
 * Monkey-patch history methods to intercept /shorts/ navigations.
 */
(function patchHistoryMethods() {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  function createPatchedMethod(originalMethod) {
    return function patchedHistoryMethod(state, unused, url) {
      if (typeof url === "string") {
        const match = url.match(SHORTS_PATH_RE);
        if (match) {
          return originalMethod(state, unused, "/watch?v=" + match[1]);
        }
        try {
          const parsed = new URL(url, location.origin);
          const fullMatch = parsed.pathname.match(SHORTS_PATH_RE);
          if (fullMatch) {
            parsed.pathname = "/watch";
            parsed.searchParams.set("v", fullMatch[1]);
            return originalMethod(state, unused, parsed.toString());
          }
        } catch (_) {}
      }
      return originalMethod(state, unused, url);
    };
  }

  history.pushState = createPatchedMethod(originalPushState);
  history.replaceState = createPatchedMethod(originalReplaceState);
})();
