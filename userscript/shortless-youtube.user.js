// ==UserScript==
// @name         Shortless YouTube
// @namespace    https://github.com/shortless-yt
// @version      1.0.0
// @description  Remove all traces of YouTube Shorts from the YouTube website
// @author       Shortless YT
// @match        *://*.youtube.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

/**
 * @file Shortless YouTube — Userscript
 *
 * Self-contained userscript that removes all traces of YouTube Shorts from
 * both desktop (www.youtube.com) and mobile (m.youtube.com) web interfaces.
 *
 * Designed for use with:
 *   - iOS Safari via the Userscripts app (https://apps.apple.com/us/app/userscripts/id1463298887)
 *   - Desktop browsers via Tampermonkey, Violentmonkey, or Greasemonkey
 *
 * Combines CSS injection and JavaScript DOM manipulation in a single file.
 */
(function () {
  'use strict';

  // ===========================================================================
  // CSS Injection
  // ===========================================================================
  // Inject hiding styles immediately at document-start so Shorts elements are
  // hidden before the first paint. We append to documentElement since <head>
  // may not exist yet.

  /**
   * Comprehensive CSS rules that hide all known YouTube Shorts elements.
   * Covers both desktop (ytd-*) and mobile (ytm-*) custom elements.
   * @type {string}
   */
  const SHORTLESS_CSS = `
    /* --- Shorts Shelves & Carousels --- */
    ytd-reel-shelf-renderer,
    ytd-rich-shelf-renderer[is-shorts],
    ytd-rich-grid-slim-media,
    ytd-reel-item-renderer,
    ytd-reel-video-renderer {
      display: none !important;
    }

    /* --- Individual Shorts in Feeds (by overlay badge) --- */
    ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
    ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
    ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
    ytd-compact-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]) {
      display: none !important;
    }

    /* --- Individual Shorts detected by /shorts/ link href --- */
    ytd-grid-video-renderer:has(a[href*="/shorts/"]),
    ytd-rich-item-renderer:has(a[href*="/shorts/"]),
    ytd-video-renderer:has(a[href*="/shorts/"]),
    ytd-compact-video-renderer:has(a[href*="/shorts/"]) {
      display: none !important;
    }

    /* --- Sidebar Navigation --- */
    ytd-guide-entry-renderer:has(a[title="Shorts"]),
    ytd-mini-guide-entry-renderer:has(a[title="Shorts"]) {
      display: none !important;
    }

    /* --- Channel Page Shorts Tab --- */
    yt-tab-shape[tab-title="Shorts"],
    tp-yt-paper-tab:has(yt-formatted-string[title="Shorts"]) {
      display: none !important;
    }

    /* --- Shorts Filter Chips --- */
    yt-chip-cloud-chip-renderer:has(yt-formatted-string[title="Shorts"]) {
      display: none !important;
    }

    /* --- Notifications --- */
    ytd-notification-renderer:has(a[href*="/shorts/"]) {
      display: none !important;
    }

    /* --- "Shorts remixing this video" section --- */
    ytd-reel-shelf-renderer[is-shorts] {
      display: none !important;
    }

    /* --- Mobile Web (m.youtube.com) --- */
    ytm-reel-shelf-renderer,
    ytm-pivot-bar-item-renderer:has(.pivot-shorts),
    ytm-shorts-lockup-view-model,
    ytm-rich-item-renderer:has(ytm-shorts-lockup-view-model),
    ytm-video-with-context-renderer:has([data-style="SHORTS"]),
    ytm-video-with-context-renderer:has(a[href*="/shorts/"]),
    ytm-media-item:has(a[href*="/shorts/"]),
    ytm-compact-video-renderer:has(a[href*="/shorts/"]) {
      display: none !important;
    }
  `;

  /** @type {HTMLStyleElement} */
  const style = document.createElement('style');
  style.textContent = SHORTLESS_CSS;
  (document.documentElement || document).appendChild(style);

  // ===========================================================================
  // Phase 1: Immediate URL Redirect
  // ===========================================================================

  /**
   * Regex matching /shorts/VIDEO_ID paths and capturing the 11-char video ID.
   * @type {RegExp}
   */
  const SHORTS_PATH_RE = /^\/shorts\/([a-zA-Z0-9_-]{11})/;

  /**
   * Redirect /shorts/VIDEO_ID to /watch?v=VIDEO_ID immediately.
   * Uses location.replace() to avoid polluting browser history.
   */
  (function immediateRedirect() {
    const match = location.pathname.match(SHORTS_PATH_RE);
    if (match) {
      location.replace('/watch?v=' + match[1]);
    }
  })();

  /**
   * Intercept YouTube's SPA navigation start event to catch /shorts/ navigations
   * before the URL changes.
   */
  document.addEventListener('yt-navigate-start', function (e) {
    try {
      var url = e.detail && e.detail.url;
      if (typeof url === 'string') {
        var match = url.match(SHORTS_PATH_RE);
        if (match) {
          location.replace('/watch?v=' + match[1]);
        }
      }
    } catch (_) {
      // Silently ignore unexpected event shapes
    }
  });

  // ===========================================================================
  // Phase 2: MutationObserver DOM Cleanup
  // ===========================================================================

  /** @type {number|null} */
  var cleanupTimer = null;

  /** @type {number} */
  var DEBOUNCE_MS = 150;

  /**
   * Run a cleanup pass removing Shorts elements that CSS :has() might miss
   * in older browsers or with localized text.
   */
  function runCleanupPass() {
    // Shorts in "Up next" sidebar
    var overlays = document.querySelectorAll(
      'ytd-compact-video-renderer [overlay-style="SHORTS"]'
    );
    for (var i = 0; i < overlays.length; i++) {
      var renderer = overlays[i].closest('ytd-compact-video-renderer');
      if (renderer) renderer.style.display = 'none';
    }

    // Sidebar navigation "Shorts" entries
    var guideEntries = document.querySelectorAll('ytd-guide-entry-renderer');
    for (var i = 0; i < guideEntries.length; i++) {
      var title = guideEntries[i].querySelector('yt-formatted-string');
      if (title && /\bShorts\b/i.test(title.textContent || '')) {
        guideEntries[i].style.display = 'none';
      }
    }

    var miniEntries = document.querySelectorAll('ytd-mini-guide-entry-renderer');
    for (var i = 0; i < miniEntries.length; i++) {
      var label = miniEntries[i].querySelector('.yt-spec-button-shape-next--button-text-content, .title');
      if (label && /\bShorts\b/i.test(label.textContent || '')) {
        miniEntries[i].style.display = 'none';
      }
    }

    // Channel tab strip
    var tabs = document.querySelectorAll("yt-tab-shape, tp-yt-paper-tab, yt-tab-group-shape [role='tab']");
    for (var i = 0; i < tabs.length; i++) {
      if (/\bShorts\b/i.test(tabs[i].textContent || '')) {
        tabs[i].style.display = 'none';
      }
    }

    // Filter chips
    var chips = document.querySelectorAll('yt-chip-cloud-chip-renderer');
    for (var i = 0; i < chips.length; i++) {
      if (/\bShorts\b/i.test(chips[i].textContent || '')) {
        chips[i].style.display = 'none';
      }
    }

    // Notifications
    var notifications = document.querySelectorAll('ytd-notification-renderer');
    for (var i = 0; i < notifications.length; i++) {
      if (notifications[i].querySelector("a[href*='/shorts/']")) {
        notifications[i].style.display = 'none';
      }
    }

    // Individual Shorts detected by /shorts/ link href (history, feeds, etc.)
    var shortsLinks = document.querySelectorAll(
      "ytd-video-renderer a[href*='/shorts/'], ytd-grid-video-renderer a[href*='/shorts/'], ytd-rich-item-renderer a[href*='/shorts/'], ytd-compact-video-renderer a[href*='/shorts/'], ytm-video-with-context-renderer a[href*='/shorts/'], ytm-media-item a[href*='/shorts/'], ytm-compact-video-renderer a[href*='/shorts/']"
    );
    for (var i = 0; i < shortsLinks.length; i++) {
      var renderer = shortsLinks[i].closest('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, ytm-video-with-context-renderer, ytm-media-item, ytm-compact-video-renderer');
      if (renderer) renderer.style.display = 'none';
    }

    // Shorts shelves
    var shelves = document.querySelectorAll('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]');
    for (var i = 0; i < shelves.length; i++) {
      shelves[i].style.display = 'none';
    }

    // Mobile: Shorts sections (header + grid of shorts cards)
    // These are ytm-rich-section-renderer elements containing
    // ytm-shorts-lockup-view-model items inside a grid-shelf-view-model.
    // Hide the entire section since it's exclusively shorts content.
    var shortsCards = document.querySelectorAll('ytm-shorts-lockup-view-model');
    for (var i = 0; i < shortsCards.length; i++) {
      var section = shortsCards[i].closest('ytm-rich-section-renderer');
      if (section && section.style.display !== 'none') {
        // Safety: only hide if no regular videos inside
        if (!section.querySelector('ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-media-item')) {
          section.style.display = 'none';
        }
      }
    }

    // Mobile: Shorts nav item (text-based fallback)
    var mobileNavItems = document.querySelectorAll('ytm-pivot-bar-item-renderer');
    for (var i = 0; i < mobileNavItems.length; i++) {
      if (mobileNavItems[i].querySelector('.pivot-shorts') || /\bShorts\b/i.test(mobileNavItems[i].textContent || '')) {
        mobileNavItems[i].style.display = 'none';
      }
    }
  }

  /**
   * Schedule a debounced cleanup pass.
   */
  function scheduleCleanup() {
    if (cleanupTimer !== null) clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(function () {
      cleanupTimer = null;
      runCleanupPass();
    }, DEBOUNCE_MS);
  }

  /**
   * Initialize the MutationObserver when the DOM is ready.
   */
  function initObserver() {
    var observer = new MutationObserver(function () {
      scheduleCleanup();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    runCleanupPass();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver, { once: true });
  } else {
    initObserver();
  }

  // ===========================================================================
  // Phase 3: SPA Navigation Handling
  // ===========================================================================

  /**
   * Re-run cleanup after YouTube SPA navigations.
   */
  document.addEventListener('yt-navigate-finish', function () {
    var match = location.pathname.match(SHORTS_PATH_RE);
    if (match) {
      location.replace('/watch?v=' + match[1]);
      return;
    }
    scheduleCleanup();
  });

  /**
   * Monkey-patch history.pushState and history.replaceState to intercept
   * /shorts/ navigations. This is the userscript equivalent of the
   * extension's declarativeNetRequest rules.
   */
  (function patchHistoryMethods() {
    var originalPushState = history.pushState.bind(history);
    var originalReplaceState = history.replaceState.bind(history);

    function createPatchedMethod(originalMethod) {
      return function (state, unused, url) {
        if (typeof url === 'string') {
          var match = url.match(SHORTS_PATH_RE);
          if (match) {
            return originalMethod(state, unused, '/watch?v=' + match[1]);
          }
          try {
            var parsed = new URL(url, location.origin);
            var fullMatch = parsed.pathname.match(SHORTS_PATH_RE);
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
})();
