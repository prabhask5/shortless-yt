/// <reference lib="webworker" />

// Service Worker for Shortless YouTube PWA
// Smart caching: immutable assets forever, API responses with TTL, YouTube thumbnails cached

const APP_VERSION = 'mld9id1v';

// Split caches by purpose
const ASSET_CACHE = 'shortless-assets-v1';              // immutable hashed assets - persist across deploys
const SHELL_CACHE = 'shortless-shell-' + APP_VERSION;   // shell/navigation - versioned per deploy
const API_CACHE = 'shortless-api-v1';                   // API responses with TTL metadata
const THUMB_CACHE = 'shortless-thumbs-v1';              // YouTube thumbnails

// API cache TTLs (milliseconds)
const API_TTLS = {
  '/api/search':           10 * 60 * 1000,       // 10 minutes
  '/api/videos':           12 * 60 * 60 * 1000,  // 12 hours (video metadata rarely changes)
  '/api/recommended':      30 * 60 * 1000,       // 30 minutes
  '/api/related':          10 * 60 * 1000,       // 10 minutes
  '/api/comments':         5 * 60 * 1000,        // 5 minutes
  '/api/channel/videos':   30 * 60 * 1000,       // 30 minutes
  '/api/channel':          24 * 60 * 60 * 1000,  // 24 hours
  '/api/playlist/videos':  30 * 60 * 1000,       // 30 minutes
  '/api/playlist':         60 * 60 * 1000,       // 1 hour
  '/api/subscriptions':    60 * 60 * 1000,       // 1 hour
};

const MAX_API_ENTRIES = 200;
const MAX_THUMB_ENTRIES = 500;
const THUMB_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Core app shell to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.webmanifest',
];

// Install: precache shell, notify clients
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await cache.add('/');
      await Promise.allSettled(
        PRECACHE_ASSETS.slice(1).map(url =>
          cache.add(url).catch(() => {})
        )
      );

      // Notify all clients that a new SW is installed (triggers UpdateToast)
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_INSTALLED', version: APP_VERSION });
        });
      });
    })
  );
  // Don't skipWaiting automatically - let the client control the transition
});

// Activate: clean old versioned caches, keep persistent ones
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => {
            // Delete old versioned shell caches
            if (name.startsWith('shortless-shell-') && name !== SHELL_CACHE) return true;
            // Delete legacy caches from old SW
            if (name.startsWith('shortless-youtube-')) return true;
            return false;
          })
          .map(name => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

// Message handler
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: APP_VERSION });
  }
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // YouTube thumbnail images - cache aggressively (external origin)
  if (url.hostname === 'i.ytimg.com' || url.hostname === 'img.youtube.com') {
    event.respondWith(handleThumbnail(event.request));
    return;
  }

  // Skip other external requests
  if (url.origin !== self.location.origin) return;

  // API routes - smart caching with TTL
  if (url.pathname.startsWith('/api/')) {
    // Never cache auth endpoints
    if (url.pathname.startsWith('/api/auth/')) return;
    event.respondWith(handleApiRequest(event.request, url));
    return;
  }

  // Navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  // Immutable assets (SvelteKit hashed files)
  if (url.pathname.includes('/_app/immutable/')) {
    event.respondWith(handleImmutableAsset(event.request));
    return;
  }

  // Other static assets
  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(event.request));
    return;
  }
});

// --- Strategy handlers ---

// API: cache-first with TTL, network fallback
// This is the key strategy for reducing YouTube API usage
async function handleApiRequest(request, url) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    const cachedAt = parseInt(cached.headers.get('X-SW-Cached-At') || '0');
    const ttl = getApiTTL(url.pathname);
    const age = Date.now() - cachedAt;

    if (age < ttl) {
      // Fresh cache - return immediately, no network request at all
      return cached;
    }

    // Stale but usable - return stale, refresh in background
    if (age < ttl * 3) {
      // Fire-and-forget background refresh
      refreshApiCache(request, cache);
      return cached;
    }
    // Too old - fall through to network
  }

  // No cache or too old - fetch from network
  return fetchAndCacheApi(request, cache);
}

async function fetchAndCacheApi(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheApiResponse(request, response.clone(), cache);
    }
    return response;
  } catch (err) {
    // Network failed - try serving any cached version as last resort
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function refreshApiCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheApiResponse(request, response, cache);
    }
  } catch {
    // Background refresh failed silently
  }
}

async function cacheApiResponse(request, response, cache) {
  // Clone response and add cache timestamp header
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set('X-SW-Cached-At', String(Date.now()));

  const cachedResponse = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  await cache.put(request, cachedResponse);

  // Lazy eviction - only check occasionally
  if (Math.random() < 0.1) {
    evictExpiredEntries(cache, MAX_API_ENTRIES);
  }
}

function getApiTTL(pathname) {
  for (const [prefix, ttl] of Object.entries(API_TTLS)) {
    if (pathname.startsWith(prefix)) return ttl;
  }
  return 5 * 60 * 1000; // 5 min default
}

// YouTube thumbnails: cache-first, very long TTL
async function handleThumbnail(request) {
  const cache = await caches.open(THUMB_CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      // Add timestamp for eviction
      cache.put(request, clone);

      // Lazy eviction
      if (Math.random() < 0.05) {
        evictOldEntries(cache, MAX_THUMB_ENTRIES);
      }
    }
    return response;
  } catch {
    if (cached) return cached;
    return new Response('', { status: 503 });
  }
}

// Navigation: network-first with 3s timeout, cache fallback
async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      cache.put('/', response.clone());
      return response;
    }
    throw new Error('Not ok');
  } catch {
    const cached = await cache.match('/');
    if (cached) return cached;

    return new Response(getOfflineHTML(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// Immutable assets: cache forever (content-hashed filenames)
async function handleImmutableAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset not available offline', { status: 503 });
  }
}

// Static assets: cache-first, no background revalidation
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

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_app/') ||
    /\.(js|css|svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/.test(pathname)
  );
}

// --- Cache eviction ---

async function evictExpiredEntries(cache, maxEntries) {
  try {
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;

    // Evict oldest 25%
    const toDelete = keys.slice(0, Math.ceil(keys.length * 0.25));
    await Promise.all(toDelete.map(key => cache.delete(key)));
  } catch {
    // Eviction is best-effort
  }
}

async function evictOldEntries(cache, maxEntries) {
  try {
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;

    // Delete oldest entries (first in = first out)
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map(key => cache.delete(key)));
  } catch {
    // Best-effort
  }
}

// --- Offline HTML ---

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
