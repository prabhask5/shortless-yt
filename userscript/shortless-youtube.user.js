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
 * Every Shorts-specific selector is targeted precisely so that all other
 * YouTube functionality and styling remains completely unchanged.
 */
(function () {
  'use strict';

  // ===========================================================================
  // CSS Injection
  // ===========================================================================
  // Inject hiding styles immediately at document-start so Shorts elements are
  // hidden before the first paint. We append to documentElement since <head>
  // may not exist yet. Only Shorts-specific elements are targeted — all other
  // YouTube UI remains untouched.

  /**
   * Comprehensive CSS rules that hide all known YouTube Shorts elements.
   * Covers both desktop (ytd-*) and mobile (ytm-*) custom elements.
   * @type {string}
   */
  var SHORTLESS_CSS = [
    '/* === Desktop: Shorts shelves & carousels === */',
    'ytd-reel-shelf-renderer,',
    'ytd-rich-shelf-renderer[is-shorts],',
    'ytd-rich-grid-slim-media,',
    'ytd-reel-item-renderer,',
    'ytd-reel-video-renderer,',
    'ytd-reel-shelf-renderer[is-shorts]',
    '{ display: none !important; }',

    '/* === Desktop: Shorts in feeds by overlay badge === */',
    'ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),',
    'ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),',
    'ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),',
    'ytd-compact-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
    '{ display: none !important; }',

    '/* === Desktop: Shorts in feeds by /shorts/ href === */',
    'ytd-grid-video-renderer:has(a[href*="/shorts/"]),',
    'ytd-rich-item-renderer:has(a[href*="/shorts/"]),',
    'ytd-video-renderer:has(a[href*="/shorts/"]),',
    'ytd-compact-video-renderer:has(a[href*="/shorts/"])',
    '{ display: none !important; }',

    '/* === Desktop: Sidebar navigation === */',
    'ytd-guide-entry-renderer:has(a[title="Shorts"]),',
    'ytd-guide-entry-renderer:has(a[href="/shorts"]),',
    'ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),',
    'ytd-mini-guide-entry-renderer:has(a[href="/shorts"])',
    '{ display: none !important; }',

    '/* === Desktop: Channel page Shorts tab === */',
    'yt-tab-shape[tab-title="Shorts"],',
    'tp-yt-paper-tab:has(yt-formatted-string[title="Shorts"]),',
    'yt-tab-shape:has(a[href*="/shorts"]),',
    'tp-yt-paper-tab:has(a[href*="/shorts"])',
    '{ display: none !important; }',

    '/* === Desktop: Search filter chips & tabs === */',
    'yt-chip-cloud-chip-renderer:has(yt-formatted-string[title="Shorts"]),',
    'yt-chip-cloud-chip-renderer[chip-title="Shorts"],',
    'yt-chip-cloud-chip-renderer:has(a[title="Shorts"]),',
    'yt-tab-shape[tab-title="Shorts"],',
    'ytd-search-filter-renderer:has(a[title="Shorts"]),',
    'ytd-search-filter-renderer:has(yt-formatted-string[title="Shorts"]),',
    'ytd-search-filter-group-renderer a[title="Short (<4 minutes)"]',
    '{ display: none !important; }',

    '/* === Desktop: Notifications === */',
    'ytd-notification-renderer:has(a[href*="/shorts/"])',
    '{ display: none !important; }',

    '/* === Desktop: Sections containing /shorts/ links === */',
    'ytd-rich-section-renderer:has(a[href*="/shorts/"]),',
    'ytd-item-section-renderer:has(ytd-reel-shelf-renderer)',
    '{ display: none !important; }',

    '/* === Desktop: Shorts player page === */',
    'ytd-shorts,',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-shorts-description"]',
    '{ display: none !important; }',

    '/* === Mobile: Shorts shelves === */',
    'ytm-reel-shelf-renderer,',
    'ytm-shorts-shelf-renderer',
    '{ display: none !important; }',

    '/* === Mobile: Bottom navigation Shorts tab === */',
    'ytm-pivot-bar-item-renderer:has(.pivot-shorts),',
    'ytm-pivot-bar-item-renderer:has(a[href="/shorts"])',
    '{ display: none !important; }',

    '/* === Mobile: Shorts cards === */',
    'ytm-shorts-lockup-view-model,',
    'ytm-shorts-lockup-view-model-v2',
    '{ display: none !important; }',

    '/* === Mobile: Rich items wrapping Shorts === */',
    'ytm-rich-item-renderer:has(ytm-shorts-lockup-view-model),',
    'ytm-rich-item-renderer:has(ytm-shorts-lockup-view-model-v2),',
    'ytm-rich-item-renderer:has(a[href*="/shorts/"])',
    '{ display: none !important; }',

    '/* === Mobile: Video renderers with SHORTS style === */',
    'ytm-video-with-context-renderer:has([data-style="SHORTS"]),',
    'ytm-video-with-context-renderer:has(a[href*="/shorts/"])',
    '{ display: none !important; }',

    '/* === Mobile: Shorts sections (header + shelf + three-dot menu) === */',
    'ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model),',
    'ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model-v2),',
    'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer),',
    'ytm-rich-section-renderer:has(ytm-shorts-shelf-renderer),',
    'ytm-rich-section-renderer:has([data-style="SHORTS"]),',
    'ytm-rich-section-renderer:has(a[href*="/shorts/"]),',
    'ytm-rich-section-renderer:has(span[title="Shorts"]),',
    'ytm-rich-section-renderer:has(.shortsLockupViewModelHostHeaderText),',
    'ytm-rich-section-renderer:has(.reel-shelf-header),',
    'ytm-rich-section-renderer:has(.shorts-shelf-header)',
    '{ display: none !important; }',

    '/* === Mobile: Item sections containing Shorts === */',
    'ytm-item-section-renderer:has(ytm-reel-shelf-renderer),',
    'ytm-item-section-renderer:has(ytm-shorts-lockup-view-model),',
    'ytm-item-section-renderer:has(ytm-shorts-lockup-view-model-v2),',
    'ytm-item-section-renderer:has(ytm-shorts-shelf-renderer),',
    'ytm-item-section-renderer:has(a[href*="/shorts/"])',
    '{ display: none !important; }',

    '/* === Mobile: Stray media items linking to /shorts/ === */',
    'ytm-media-item:has(a[href*="/shorts/"]),',
    'ytm-compact-video-renderer:has(a[href*="/shorts/"]),',
    'ytm-tab-renderer:has(a[href*="/shorts"]),',
    'ytm-notification-renderer:has(a[href*="/shorts/"])',
    '{ display: none !important; }',

    '/* === Mobile: Shorts player page === */',
    'ytm-shorts-player',
    '{ display: none !important; }',
  ].join('\n');

  /** @type {HTMLStyleElement} */
  var style = document.createElement('style');
  style.textContent = SHORTLESS_CSS;
  // Append to documentElement because <head> may not exist yet at document-start
  (document.documentElement || document).appendChild(style);

  // ===========================================================================
  // Phase 1: Immediate URL Redirect
  // ===========================================================================

  /**
   * Regex matching /shorts/VIDEO_ID paths and capturing the 11-char video ID.
   * @type {RegExp}
   */
  var SHORTS_PATH_RE = /^\/shorts\/([a-zA-Z0-9_-]{11})/;

  /**
   * Redirect /shorts/VIDEO_ID to /watch?v=VIDEO_ID immediately.
   */
  (function immediateRedirect() {
    var match = location.pathname.match(SHORTS_PATH_RE);
    if (match) {
      location.replace('/watch?v=' + match[1]);
    }
  })();

  /**
   * Intercept YouTube's SPA navigation start event.
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
    } catch (_) {}
  });

  // ===========================================================================
  // Phase 2: MutationObserver DOM Cleanup
  // ===========================================================================
  // JS fallback for anything CSS can't catch — localized text, missing
  // attributes, older browsers without :has() support, etc.

  /** @type {number|null} */
  var cleanupTimer = null;

  /**
   * After navigation, first cleanup runs immediately (no debounce).
   * @type {boolean}
   */
  var needsImmediateCleanup = true;

  /** @type {number} */
  var DEBOUNCE_MS = 150;

  /**
   * Detect mobile vs desktop once. Avoids querying irrelevant elements.
   * @type {boolean}
   */
  var isMobile = location.hostname === 'm.youtube.com';

  /**
   * Hide an element. No-ops if already hidden or null.
   * @param {HTMLElement|null} el
   */
  function hide(el) {
    if (el && el.style.display !== 'none') {
      el.style.display = 'none';
    }
  }

  /**
   * Run cleanup — only queries elements relevant to the current platform.
   * CSS handles ~95% of hiding; this catches localized text and edge cases.
   */
  function runCleanupPass() {
    if (isMobile) {
      runMobileCleanup();
    } else {
      runDesktopCleanup();
    }
  }

  /** Desktop-only cleanup. */
  function runDesktopCleanup() {
    // Overlay badge fallback (for browsers without :has())
    var overlays = document.querySelectorAll('[overlay-style="SHORTS"]');
    for (var i = 0; i < overlays.length; i++) {
      hide(overlays[i].closest(
        'ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer'
      ));
    }

    // Sidebar "Shorts" entries — text match for localized labels
    var guideEntries = document.querySelectorAll(
      'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer'
    );
    for (var i = 0; i < guideEntries.length; i++) {
      if (/\bShorts\b/i.test(guideEntries[i].textContent || '')) {
        hide(guideEntries[i]);
      }
    }

    // Channel tabs & search tabs — text match
    var tabs = document.querySelectorAll('yt-tab-shape, tp-yt-paper-tab');
    for (var i = 0; i < tabs.length; i++) {
      if (/\bShorts\b/i.test(tabs[i].textContent || '')) {
        hide(tabs[i]);
      }
    }

    // Filter chips — text match
    var chips = document.querySelectorAll('yt-chip-cloud-chip-renderer');
    for (var i = 0; i < chips.length; i++) {
      if (/\bShorts\b/i.test(chips[i].textContent || '')) {
        hide(chips[i]);
      }
    }
  }

  /** Mobile-only cleanup. */
  function runMobileCleanup() {
    // Shorts sections (header + shelf + three-dot menu)
    var sections = document.querySelectorAll(
      'ytm-rich-section-renderer, ytm-item-section-renderer'
    );
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      if (
        section.querySelector(
          'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ' +
          'ytm-reel-shelf-renderer, ytm-shorts-shelf-renderer, ' +
          '[data-style="SHORTS"], a[href*="/shorts/"]'
        )
      ) {
        hide(section);
        continue;
      }
      var header = section.querySelector('h2, [role="heading"], span[title]');
      if (header && /\bShorts\b/i.test(header.textContent || '')) {
        hide(section);
      }
    }

    // Bottom nav "Shorts" tab
    var navItems = document.querySelectorAll('ytm-pivot-bar-item-renderer');
    for (var i = 0; i < navItems.length; i++) {
      if (
        navItems[i].querySelector('.pivot-shorts, a[href="/shorts"]') ||
        /\bShorts\b/i.test(navItems[i].textContent || '')
      ) {
        hide(navItems[i]);
      }
    }

    // Stray Shorts cards
    var cards = document.querySelectorAll(
      'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2'
    );
    for (var i = 0; i < cards.length; i++) {
      hide(cards[i]);
      hide(cards[i].closest('ytm-rich-item-renderer'));
    }

    // Mobile channel tabs
    var tabs = document.querySelectorAll('ytm-tab-renderer');
    for (var i = 0; i < tabs.length; i++) {
      if (
        tabs[i].querySelector('a[href*="/shorts"]') ||
        /\bShorts\b/i.test(tabs[i].textContent || '')
      ) {
        hide(tabs[i]);
      }
    }
  }

  /**
   * Schedule a cleanup pass. First one after navigation is immediate.
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

  document.addEventListener('yt-navigate-finish', function () {
    var match = location.pathname.match(SHORTS_PATH_RE);
    if (match) {
      location.replace('/watch?v=' + match[1]);
      return;
    }
    needsImmediateCleanup = true;
    scheduleCleanup();
  });

  /**
   * Monkey-patch history.pushState and history.replaceState to intercept
   * /shorts/ navigations.
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
          } catch (_) {}
        }
        return originalMethod(state, unused, url);
      };
    }

    history.pushState = createPatchedMethod(originalPushState);
    history.replaceState = createPatchedMethod(originalReplaceState);
  })();
})();
