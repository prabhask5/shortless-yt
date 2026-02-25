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
 * MOBILE CSS STRATEGY: On mobile, CSS only hides elements by their exact
 * custom-element tag name (ytm-shorts-*, ytm-reel-*). NO :has() selectors
 * are used for mobile because iOS Safari's :has() can over-match when
 * YouTube nests elements unexpectedly, hiding entire pages of content.
 * All nuanced mobile hiding (parent wrappers, text-based matches) is
 * handled by the JS MutationObserver instead.
 */
(function () {
  'use strict';

  // ===========================================================================
  // CSS Injection
  // ===========================================================================

  /**
   * CSS rules that hide known YouTube Shorts elements.
   *
   * DESKTOP: Uses :has() selectors freely — Chrome/Firefox handle them well.
   * MOBILE:  Tag-name selectors ONLY — no :has(), no class selectors.
   *          JS handles everything else to avoid over-hiding.
   *
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
    'ytd-grid-video-renderer:has(> div > a[href*="/shorts/"]),',
    'ytd-video-renderer:has(> .text-wrapper > a[href*="/shorts/"]),',
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

    '/* === Desktop: Sections/shelves containing Shorts === */',
    'ytd-item-section-renderer:has(ytd-reel-shelf-renderer),',
    'ytd-shelf-renderer:has(ytd-reel-item-renderer)',
    '{ display: none !important; }',

    '/* === Desktop: Shorts player page === */',
    'ytd-shorts,',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-shorts-description"]',
    '{ display: none !important; }',

    '/* === Mobile: Shorts-specific elements (tag-name only, NO :has()) === */',
    '/* These custom elements are used EXCLUSIVELY for Shorts content. */',
    '/* Hiding by tag name is 100% safe — they never contain regular videos. */',
    'ytm-reel-shelf-renderer,',
    'ytm-shorts-shelf-renderer,',
    'ytm-shorts-lockup-view-model,',
    'ytm-shorts-lockup-view-model-v2,',
    'ytm-shorts-player',
    '{ display: none !important; }',
  ].join('\n');

  /** @type {HTMLStyleElement} */
  var style = document.createElement('style');
  style.textContent = SHORTLESS_CSS;
  (document.documentElement || document).appendChild(style);

  // ===========================================================================
  // Phase 1: Immediate URL Redirect
  // ===========================================================================

  /** @type {RegExp} */
  var SHORTS_PATH_RE = /^\/shorts\/([a-zA-Z0-9_-]{11})/;

  (function immediateRedirect() {
    var match = location.pathname.match(SHORTS_PATH_RE);
    if (match) {
      location.replace('/watch?v=' + match[1]);
    }
  })();

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

  /** @type {number|null} */
  var cleanupTimer = null;

  /** @type {boolean} */
  var needsImmediateCleanup = true;

  /** @type {number} */
  var DEBOUNCE_MS = 150;

  /** @type {boolean} */
  var isMobile = location.hostname === 'm.youtube.com';

  /** @type {boolean} — Prevents our own DOM changes from re-triggering the observer. */
  var isRunningCleanup = false;

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

    // "Latest from [CHANNEL]" shelves containing Shorts reel items
    var shelves = document.querySelectorAll('ytd-shelf-renderer');
    for (var i = 0; i < shelves.length; i++) {
      if (shelves[i].querySelector('ytd-reel-item-renderer')) {
        hide(shelves[i]);
      }
    }
  }

  /**
   * Mobile-only cleanup.
   *
   * IMPORTANT: Never hide containers (sections, item-sections, etc.).
   * YouTube puts regular videos and Shorts in the same containers.
   * Only hide individual Shorts-specific elements.
   */
  function runMobileCleanup() {
    // 1. Hide Shorts lockup cards (already hidden by CSS tag-name, but
    //    also hide their parent ytm-rich-item-renderer wrapper via JS)
    var cards = document.querySelectorAll(
      'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2'
    );
    for (var i = 0; i < cards.length; i++) {
      hide(cards[i]);
      // Only hide the IMMEDIATE rich-item wrapper, not any higher container
      var wrapper = cards[i].closest('ytm-rich-item-renderer');
      if (wrapper) {
        hide(wrapper);
      }
    }

    // 2. Hide Shorts shelves (already hidden by CSS, JS fallback)
    var shelves = document.querySelectorAll(
      'ytm-reel-shelf-renderer, ytm-shorts-shelf-renderer'
    );
    for (var i = 0; i < shelves.length; i++) {
      hide(shelves[i]);
    }

    // 3. Hide individual video renderers that are Shorts.
    //    Check for [data-style="SHORTS"] on the renderer itself or
    //    on a direct child — NOT using :has() to avoid over-matching.
    var videoRenderers = document.querySelectorAll('ytm-video-with-context-renderer');
    for (var i = 0; i < videoRenderers.length; i++) {
      var renderer = videoRenderers[i];
      // Check if THIS renderer or its children have data-style="SHORTS"
      if (
        renderer.getAttribute('data-style') === 'SHORTS' ||
        renderer.querySelector(':scope > [data-style="SHORTS"]')
      ) {
        hide(renderer);
      }
    }

    // 4. Clean up sections that contain ONLY shorts content.
    //    After hiding individual shorts elements above, check if any section
    //    has no remaining regular video content. If so, the section was
    //    exclusively shorts (e.g. "Latest from [CHANNEL]" with shorts logo)
    //    and the whole section should be hidden — including its header.
    var sections = document.querySelectorAll(
      'ytm-rich-section-renderer, ytm-item-section-renderer'
    );
    for (var s = 0; s < sections.length; s++) {
      var section = sections[s];
      if (section.style.display === 'none') continue;

      // Only consider sections that actually contain shorts-specific elements
      if (!section.querySelector(
        'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ' +
        'ytm-reel-shelf-renderer, ytm-shorts-shelf-renderer'
      )) {
        continue;
      }

      // Check if any rich-item in this section contains regular (non-shorts) content
      var richItems = section.querySelectorAll('ytm-rich-item-renderer');
      var hasRegularContent = false;
      for (var r = 0; r < richItems.length; r++) {
        if (!richItems[r].querySelector(
          'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2'
        )) {
          hasRegularContent = true;
          break;
        }
      }

      // Also check for regular video renderers not styled as SHORTS
      if (!hasRegularContent) {
        var videoRenderers = section.querySelectorAll('ytm-video-with-context-renderer');
        for (var v = 0; v < videoRenderers.length; v++) {
          if (videoRenderers[v].getAttribute('data-style') !== 'SHORTS') {
            hasRegularContent = true;
            break;
          }
        }
      }

      // Section has ONLY shorts content → safe to hide entirely
      if (!hasRegularContent) {
        hide(section);
      }
    }

    // 5. Bottom nav "Shorts" tab — hide only the Shorts pivot item
    var navItems = document.querySelectorAll('ytm-pivot-bar-item-renderer');
    for (var i = 0; i < navItems.length; i++) {
      if (navItems[i].querySelector('.pivot-shorts, a[href="/shorts"]')) {
        hide(navItems[i]);
      }
    }

    // 5. Mobile channel "Shorts" tab
    var tabs = document.querySelectorAll('ytm-tab-renderer');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].querySelector('a[href*="/shorts"]')) {
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
      if (!isRunningCleanup) {
        scheduleCleanup();
      }
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
