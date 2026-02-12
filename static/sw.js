/// <reference lib="webworker" />

/**
 * Service Worker for Shortless YouTube PWA
 *
 * This service worker implements a multi-strategy caching system to provide
 * fast load times, offline support, and reduced YouTube API quota consumption.
 *
 * Caching Architecture (4 separate Cache Storage buckets):
 *
 *   1. ASSET_CACHE  - Immutable, content-hashed JS/CSS bundles from SvelteKit.
 *                     These never change (the hash changes instead), so they are
 *                     cached indefinitely and persist across app deploys.
 *
 *   2. SHELL_CACHE  - The app shell (HTML, favicon, manifest) and other static assets.
 *                     Versioned per deploy via APP_VERSION so old shells are cleaned up
 *                     when a new service worker activates.
 *
 *   3. API_CACHE    - YouTube API proxy responses with per-endpoint TTL metadata.
 *                     Uses a 3-tier freshness model: fresh (serve from cache), stale
 *                     (serve from cache + background revalidate), expired (network-first).
 *
 *   4. THUMB_CACHE  - YouTube video/channel thumbnail images from i.ytimg.com.
 *                     Cache-first with FIFO eviction when the entry count exceeds the limit.
 *
 * Version Management:
 *   APP_VERSION is automatically patched by the Vite build plugin (see vite.config.ts).
 *   On each build, a new base-36 timestamp is injected, causing the browser to detect
 *   a byte-different service worker file and trigger the install -> waiting -> activate
 *   lifecycle. The app's UpdateToast component listens for the SW_INSTALLED message
 *   to prompt the user to reload.
 *
 * @see vite.config.ts - serviceWorkerVersion() plugin that patches APP_VERSION
 */

/** Unique version identifier, auto-updated on each build by the Vite plugin */
const APP_VERSION = 'mlfmexw4';

/* ============================================================
   Cache Bucket Names
   ============================================================ */

/** Immutable hashed assets (JS/CSS) - persist across deploys since filenames contain content hashes */
const ASSET_CACHE = 'shortless-assets-v1';
/** App shell and static assets - versioned per deploy so old versions get cleaned up on activate */
const SHELL_CACHE = 'shortless-shell-' + APP_VERSION;
/** YouTube API proxy responses - stored with X-SW-Cached-At timestamp header for TTL checks */
const API_CACHE = 'shortless-api-v1';
/** YouTube thumbnail images from i.ytimg.com and img.youtube.com */
const THUMB_CACHE = 'shortless-thumbs-v1';

/* ============================================================
   API Cache TTL Configuration
   ============================================================ */

/**
 * Per-endpoint TTL (Time To Live) values in milliseconds.
 *
 * Shorter TTLs for frequently changing data (search results, comments),
 * longer TTLs for stable data (video metadata, channel info).
 *
 * The TTL controls three freshness tiers in handleApiRequest():
 *   - age < TTL         : FRESH - serve from cache immediately, no network request
 *   - TTL < age < TTL*3 : STALE - serve from cache, revalidate in background
 *   - age > TTL*3       : EXPIRED - fetch from network, fall back to cache on failure
 */
const API_TTLS = {
  '/api/search':           10 * 60 * 1000,       // 10 minutes - search results change frequently
  '/api/videos':           12 * 60 * 60 * 1000,  // 12 hours - video metadata (title, views) is stable
  '/api/recommended':      30 * 60 * 1000,       // 30 minutes - home feed recommendations
  '/api/related':          10 * 60 * 1000,        // 10 minutes - related videos sidebar
  '/api/comments':         5 * 60 * 1000,         // 5 minutes - comments update frequently
  '/api/channel/videos':   30 * 60 * 1000,        // 30 minutes - channel video listings
  '/api/channel':          24 * 60 * 60 * 1000,   // 24 hours - channel metadata (name, avatar, etc.)
  '/api/playlist/videos':  30 * 60 * 1000,        // 30 minutes - playlist video listings
  '/api/playlist':         60 * 60 * 1000,        // 1 hour - playlist metadata
  '/api/subscriptions':    60 * 60 * 1000,        // 1 hour - user subscription feed
};

/* ============================================================
   Cache Size Limits & Eviction Thresholds
   ============================================================ */

/** Maximum number of cached API responses before triggering eviction */
const MAX_API_ENTRIES = 200;
/** Maximum number of cached thumbnail images before triggering eviction */
const MAX_THUMB_ENTRIES = 500;
/** Thumbnail cache TTL - 7 days (thumbnails rarely change for existing videos) */
const THUMB_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ============================================================
   Precache Configuration
   ============================================================ */

/**
 * Core app shell resources to precache during the install event.
 * These are the minimum resources needed to render the app when offline.
 * The root '/' is cached first (critical), others use allSettled (best-effort).
 */
const PRECACHE_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.webmanifest',
];

/* ============================================================
   Service Worker Lifecycle Events
   ============================================================ */

/**
 * INSTALL EVENT
 *
 * Triggered when the browser detects a new or updated service worker.
 * Precaches the app shell into the versioned SHELL_CACHE, then notifies
 * all open tabs/windows so the UI can show an "Update available" toast.
 *
 * Note: skipWaiting() is NOT called here. Instead, the client sends a
 * SKIP_WAITING message when the user clicks "Update" in the toast.
 * This prevents disrupting active sessions with a mid-use cache swap.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // Cache the root HTML shell first - this is critical for offline support
      await cache.add('/');
      // Cache remaining assets with allSettled so one failure doesn't block installation
      await Promise.allSettled(
        PRECACHE_ASSETS.slice(1).map(url =>
          cache.add(url).catch(() => {})
        )
      );

      // Notify all open client windows that a new SW version is available.
      // The app's UpdateToast component listens for this message type.
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_INSTALLED', version: APP_VERSION });
        });
      });
    })
  );
  // Don't skipWaiting automatically - let the client control the transition
  // via the SKIP_WAITING message handler below
});

/**
 * ACTIVATE EVENT
 *
 * Triggered after install when the new SW takes control. This is where
 * old caches are cleaned up. Only versioned shell caches are deleted;
 * the persistent caches (ASSET_CACHE, API_CACHE, THUMB_CACHE) survive
 * across deploys since their data is still valid.
 *
 * clients.claim() ensures this SW immediately controls all open tabs
 * without requiring a page reload (useful after the user clicks "Update").
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => {
            // Delete old versioned shell caches (e.g., shortless-shell-abc123)
            if (name.startsWith('shortless-shell-') && name !== SHELL_CACHE) return true;
            // Delete legacy caches from a previous SW implementation
            if (name.startsWith('shortless-youtube-')) return true;
            return false;
          })
          .map(name => caches.delete(name))
      );
      // Take control of all open clients immediately (no reload needed)
      await self.clients.claim();
    })()
  );
});

/* ============================================================
   Client Message Handler
   ============================================================ */

/**
 * MESSAGE EVENT
 *
 * Handles postMessage() calls from the app's client-side JavaScript.
 * Supported message types:
 *
 *   - SKIP_WAITING: Sent when the user clicks "Update" in the UpdateToast.
 *     Calls skipWaiting() to promote this SW from "waiting" to "active".
 *
 *   - GET_VERSION: Sent by the app to query the current SW version.
 *     Responds via the MessagePort with the APP_VERSION string.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    // Respond on the MessageChannel port so the caller gets the version asynchronously
    event.ports[0]?.postMessage({ version: APP_VERSION });
  }
});

/* ============================================================
   Fetch Event Router
   ============================================================ */

/**
 * FETCH EVENT
 *
 * The main request interceptor. Routes each GET request to the appropriate
 * caching strategy handler based on the URL pattern:
 *
 *   1. YouTube thumbnails (i.ytimg.com)  -> handleThumbnail()   [cache-first]
 *   2. API routes (/api/*)              -> handleApiRequest()   [cache-first with TTL]
 *   3. Navigation (HTML pages)          -> handleNavigation()   [network-first, 3s timeout]
 *   4. Immutable assets (/_app/immutable/) -> handleImmutableAsset() [cache-forever]
 *   5. Other static assets (.js, .css, etc.) -> handleStaticAsset() [cache-first]
 *
 * Non-GET requests and cross-origin requests (except thumbnails) are passed through
 * to the network without interception. Auth endpoints are never cached.
 */
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests - POST/PUT/DELETE should always go to the network
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // YouTube thumbnail images - cache aggressively (these are cross-origin but safe to cache)
  if (url.hostname === 'i.ytimg.com' || url.hostname === 'img.youtube.com') {
    event.respondWith(handleThumbnail(event.request));
    return;
  }

  // Skip all other cross-origin requests (third-party scripts, analytics, etc.)
  if (url.origin !== self.location.origin) return;

  // API routes - smart caching with per-endpoint TTL
  if (url.pathname.startsWith('/api/')) {
    // Never cache auth endpoints - tokens and session data must always be fresh
    if (url.pathname.startsWith('/api/auth/')) return;
    event.respondWith(handleApiRequest(event.request, url));
    return;
  }

  // Navigation requests (user clicking links, typing URLs, back/forward)
  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  // Immutable assets - SvelteKit content-hashed files (e.g., /_app/immutable/chunks/abc123.js)
  if (url.pathname.includes('/_app/immutable/')) {
    event.respondWith(handleImmutableAsset(event.request));
    return;
  }

  // Other static assets (non-hashed JS, CSS, images, fonts, etc.)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(event.request));
    return;
  }
});

/* ============================================================
   Caching Strategy Handlers
   ============================================================ */

/**
 * API Request Handler - Cache-first with TTL and stale-while-revalidate
 *
 * This is the most important caching strategy in the app. It reduces YouTube API
 * quota usage by serving cached responses when possible, using a 3-tier freshness model:
 *
 *   Tier 1 (FRESH):   age < TTL
 *     Return cached response immediately. No network request at all.
 *     This is the fast path that avoids API calls entirely.
 *
 *   Tier 2 (STALE):   TTL < age < TTL * 3
 *     Return the stale cached response immediately for fast UI rendering,
 *     then fire-and-forget a background fetch to refresh the cache for next time.
 *     Similar to the "stale-while-revalidate" HTTP cache directive.
 *
 *   Tier 3 (EXPIRED): age > TTL * 3
 *     Cache is too old to serve. Fetch from network, with cache as a last resort
 *     if the network fails (offline fallback).
 *
 * @param {Request} request - The intercepted fetch request
 * @param {URL}     url     - Parsed URL of the request (used for TTL lookup)
 * @returns {Promise<Response>} The response to serve to the client
 */
async function handleApiRequest(request, url) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    // Read the timestamp we injected when this response was cached
    const cachedAt = parseInt(cached.headers.get('X-SW-Cached-At') || '0');
    const ttl = getApiTTL(url.pathname);
    const age = Date.now() - cachedAt;

    // Tier 1: FRESH - serve from cache, skip network entirely
    if (age < ttl) {
      return cached;
    }

    // Tier 2: STALE - serve from cache now, refresh in background for next request
    if (age < ttl * 3) {
      refreshApiCache(request, cache);
      return cached;
    }
    // Tier 3: EXPIRED - fall through to network fetch below
  }

  // No cache hit or cache too old - fetch from network
  return fetchAndCacheApi(request, cache);
}

/**
 * Fetches an API response from the network, caches it, and returns it.
 * If the network is unavailable, falls back to any cached version (even expired)
 * as a last resort. If no cache exists either, returns a 503 JSON error.
 *
 * @param {Request}  request - The original fetch request
 * @param {Cache}    cache   - The opened API_CACHE instance
 * @returns {Promise<Response>} The network response, cached response, or 503 error
 */
async function fetchAndCacheApi(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Clone before caching because a Response body can only be consumed once
      await cacheApiResponse(request, response.clone(), cache);
    }
    return response;
  } catch (err) {
    // Network failed - try serving any cached version as a last resort (even expired)
    const cached = await cache.match(request);
    if (cached) return cached;
    // No cache available - return an offline error response
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Background cache refresh for stale API responses.
 * Called in fire-and-forget fashion (no await) so the user gets the stale
 * response immediately while the cache is updated for the next request.
 * Failures are silently ignored since this is a best-effort optimization.
 *
 * @param {Request} request - The original fetch request to re-fetch
 * @param {Cache}   cache   - The opened API_CACHE instance
 */
async function refreshApiCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheApiResponse(request, response, cache);
    }
  } catch {
    // Background refresh failed silently - the stale cache is still valid
  }
}

/**
 * Stores an API response in the cache with a timestamp metadata header.
 *
 * The response is reconstructed with an added `X-SW-Cached-At` header containing
 * the current timestamp. This custom header is later read by handleApiRequest()
 * to determine the cached response's age for the TTL freshness check.
 *
 * Also triggers probabilistic cache eviction (10% chance per write) to keep
 * the cache size bounded without the overhead of checking on every request.
 *
 * @param {Request}  request  - The cache key (URL + headers)
 * @param {Response} response - The API response to cache (must not have been consumed)
 * @param {Cache}    cache    - The opened API_CACHE instance
 */
async function cacheApiResponse(request, response, cache) {
  // Read the response body as an ArrayBuffer so we can create a new Response
  // with modified headers (Response headers are immutable on the original)
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  // Inject the cache timestamp as a custom header for TTL age calculations
  headers.set('X-SW-Cached-At', String(Date.now()));

  const cachedResponse = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  await cache.put(request, cachedResponse);

  // Probabilistic eviction: only check 10% of the time to avoid performance overhead.
  // When triggered, removes the oldest 25% of entries if the cache exceeds MAX_API_ENTRIES.
  if (Math.random() < 0.1) {
    evictExpiredEntries(cache, MAX_API_ENTRIES);
  }
}

/**
 * Looks up the TTL for a given API endpoint pathname.
 * Matches by prefix, so "/api/channel/videos" matches before "/api/channel".
 * Falls back to 5 minutes for any unrecognized API routes.
 *
 * @param {string} pathname - The URL pathname (e.g., "/api/search")
 * @returns {number} TTL in milliseconds
 */
function getApiTTL(pathname) {
  for (const [prefix, ttl] of Object.entries(API_TTLS)) {
    if (pathname.startsWith(prefix)) return ttl;
  }
  return 5 * 60 * 1000; // 5 min default for unrecognized API routes
}

/**
 * YouTube Thumbnail Handler - Cache-first strategy
 *
 * Thumbnails are fetched from YouTube's CDN (i.ytimg.com, img.youtube.com)
 * and cached indefinitely since they rarely change for existing videos.
 * On cache hit, returns immediately without any network request.
 *
 * Eviction is probabilistic (5% chance per cache miss) using FIFO ordering
 * to keep the cache under MAX_THUMB_ENTRIES.
 *
 * @param {Request} request - The thumbnail image request
 * @returns {Promise<Response>} The cached or fetched thumbnail response
 */
async function handleThumbnail(request) {
  const cache = await caches.open(THUMB_CACHE);
  const cached = await cache.match(request);

  // Cache hit - return immediately, no network request needed
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Clone before caching (response body is single-use)
      const clone = response.clone();
      cache.put(request, clone);

      // Probabilistic eviction: 5% chance to trim cache on each new entry.
      // Lower probability than API cache since thumbnails are smaller and more numerous.
      if (Math.random() < 0.05) {
        evictOldEntries(cache, MAX_THUMB_ENTRIES);
      }
    }
    return response;
  } catch {
    // Network failed - return cached version if somehow available, otherwise 503
    if (cached) return cached;
    return new Response('', { status: 503 });
  }
}

/**
 * Navigation Handler - Network-first with 3-second timeout
 *
 * For HTML page navigations (clicking links, typing URLs), this strategy
 * tries the network first to get the freshest HTML shell, but aborts after
 * 3 seconds and falls back to the cached app shell. This ensures fast
 * navigation even on slow connections.
 *
 * Since this is a SPA, all navigation requests are served the same root '/'
 * HTML shell, which then handles client-side routing via SvelteKit.
 *
 * Fallback chain: Network (3s timeout) -> Cached '/' -> Inline offline HTML
 *
 * @param {Request} request - The navigation request
 * @returns {Promise<Response>} The HTML response for the page
 */
async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    // Set up a 3-second abort timeout for slow/unresponsive networks
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      // Update the cached shell with the latest version for next offline use
      cache.put('/', response.clone());
      return response;
    }
    // Non-OK responses (4xx, 5xx) - fall through to cache
    throw new Error('Not ok');
  } catch {
    // Network failed or timed out - serve the cached app shell
    const cached = await cache.match('/');
    if (cached) return cached;

    // No cached shell available - serve a minimal inline offline page
    return new Response(getOfflineHTML(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/**
 * Immutable Asset Handler - Cache-forever strategy
 *
 * SvelteKit places content-hashed files under /_app/immutable/ (e.g.,
 * /_app/immutable/chunks/abc123.js). Because the filename contains a
 * hash of the file contents, the content at any given URL will never
 * change. This means we can cache these files permanently.
 *
 * These are stored in the unversioned ASSET_CACHE (not the per-deploy
 * SHELL_CACHE) so they survive across app updates.
 *
 * @param {Request} request - The asset request
 * @returns {Promise<Response>} The cached or fetched asset response
 */
async function handleImmutableAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  // Cache hit - return immediately (these files never change)
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Cache permanently - the content hash in the filename guarantees uniqueness
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset not available offline', { status: 503 });
  }
}

/**
 * Static Asset Handler - Cache-first, no background revalidation
 *
 * Handles non-hashed static files (favicon, manifest, non-immutable JS/CSS).
 * These are stored in the versioned SHELL_CACHE and are cleaned up on
 * each new deploy when the old shell cache is deleted during activate.
 *
 * @param {Request} request - The static asset request
 * @returns {Promise<Response>} The cached or fetched asset response
 */
async function handleStaticAsset(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

/**
 * Determines whether a given pathname refers to a static asset
 * based on the URL path prefix or file extension.
 *
 * @param {string} pathname - The URL pathname to check
 * @returns {boolean} True if the pathname looks like a static asset
 */
function isStaticAsset(pathname) {
  return (
    // SvelteKit app directory (includes non-immutable assets like version.json)
    pathname.startsWith('/_app/') ||
    // Common static asset file extensions (scripts, styles, images, fonts)
    /\.(js|css|svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/.test(pathname)
  );
}

/* ============================================================
   Cache Eviction Utilities
   ============================================================ */

/**
 * Evicts the oldest 25% of entries from a cache when it exceeds maxEntries.
 * Used for the API cache, which has TTL-based entries that become stale.
 *
 * Cache Storage keys() returns entries in insertion order, so slicing from
 * the start gives us the oldest entries.
 *
 * This is a best-effort operation - eviction failures are silently ignored
 * since cache storage is not critical to app functionality.
 *
 * @param {Cache}  cache      - The cache to evict from
 * @param {number} maxEntries - The maximum number of entries to keep
 */
async function evictExpiredEntries(cache, maxEntries) {
  try {
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;

    // Remove the oldest 25% of entries to create headroom and avoid
    // triggering eviction on every subsequent cache write
    const toDelete = keys.slice(0, Math.ceil(keys.length * 0.25));
    await Promise.all(toDelete.map(key => cache.delete(key)));
  } catch {
    // Eviction is best-effort - don't let failures affect the SW
  }
}

/**
 * Evicts oldest entries from a cache to bring it back under maxEntries.
 * Used for the thumbnail cache, which uses simple FIFO (First In, First Out)
 * eviction since thumbnails don't have TTL metadata.
 *
 * Deletes just enough entries to bring the total back down to maxEntries.
 *
 * @param {Cache}  cache      - The cache to evict from
 * @param {number} maxEntries - The maximum number of entries to keep
 */
async function evictOldEntries(cache, maxEntries) {
  try {
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;

    // Delete only the excess entries (oldest first, based on insertion order)
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map(key => cache.delete(key)));
  } catch {
    // Best-effort eviction
  }
}

/* ============================================================
   Offline Fallback HTML
   ============================================================ */

/**
 * Returns a self-contained HTML page displayed when the app is offline
 * and no cached shell is available. This is the last-resort fallback.
 *
 * The page is fully inline (no external CSS/JS dependencies) with a
 * dark theme matching the app's design, an offline message, and a
 * "Try Again" button that reloads the page.
 *
 * @returns {string} Complete HTML document as a string
 */
function getOfflineHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - Shortless</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #0f0f0f;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 2rem;
      text-align: center;
    }
    .icon { font-size: 3rem; margin-bottom: 1.5rem; opacity: 0.6; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.75rem; }
    p { color: #a1a1aa; max-width: 300px; line-height: 1.6; margin-bottom: 2rem; }
    button {
      padding: 0.75rem 2rem;
      background: #cc0000;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #aa0000; }
  </style>
</head>
<body>
  <div class="icon">&#128247;</div>
  <h1>You're Offline</h1>
  <p>Check your internet connection and try again. Cached content may still be available.</p>
  <button onclick="location.reload()">Try Again</button>
</body>
</html>`;
}
