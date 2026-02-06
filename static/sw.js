/// <reference lib="webworker" />

const CACHE_NAME = 'shortless-youtube-v2';
const STATIC_CACHE = 'shortless-youtube-static-v2';
const API_CACHE = 'shortless-youtube-api-v2';

const MAX_API_CACHE_ENTRIES = 100;
const API_CACHE_TTL = {
	'/api/search': 10 * 60 * 1000,
	'/api/videos': 12 * 60 * 60 * 1000,
	'/api/comments': 5 * 60 * 1000,
	'/api/related': 10 * 60 * 1000,
	'/api/recommended': 30 * 60 * 1000,
};

// Static assets to precache
const PRECACHE_URLS = [
	'/',
	'/favicon.svg',
	'/manifest.webmanifest',
];

// Listen for skip waiting message from client
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

// Install: precache static assets (don't skipWaiting automatically — let the client decide)
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(STATIC_CACHE)
			.then(cache => cache.addAll(PRECACHE_URLS))
	);
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(keys =>
			Promise.all(
				keys
					.filter(key => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME)
					.map(key => caches.delete(key))
			)
		).then(() => self.clients.claim())
	);
});

// Fetch handler
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Only handle same-origin requests
	if (url.origin !== self.location.origin) return;

	// API routes: stale-while-revalidate
	if (url.pathname.startsWith('/api/')) {
		// Don't cache auth-dependent endpoints
		if (url.pathname.startsWith('/api/auth/')) return;
		if (url.pathname.startsWith('/api/recommended')) return;

		event.respondWith(
			caches.open(API_CACHE).then(async (cache) => {
				const cached = await cache.match(event.request);

				const fetchPromise = fetch(event.request)
					.then(response => {
						if (response.ok) {
							// Clone and cache
							const clone = response.clone();
							limitCacheSize(cache, MAX_API_CACHE_ENTRIES).then(() => {
								cache.put(event.request, clone);
							});
						}
						return response;
					})
					.catch(() => {
						// Network failed, return cached if available
						if (cached) return cached;
						return new Response(JSON.stringify({ error: 'Offline' }), {
							status: 503,
							headers: { 'Content-Type': 'application/json' }
						});
					});

				// Return cached immediately if available (stale-while-revalidate)
				return cached || fetchPromise;
			})
		);
		return;
	}

	// Navigation and static assets: cache-first with network fallback
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request)
				.then(response => {
					// Cache successful navigation responses
					const clone = response.clone();
					caches.open(STATIC_CACHE).then(cache => {
						cache.put(event.request, clone);
					});
					return response;
				})
				.catch(() => {
					return caches.match(event.request)
						.then(cached => cached || caches.match('/'));
				})
		);
		return;
	}

	// Static assets
	if (url.pathname.match(/\.(js|css|svg|png|jpg|webp|woff2?)$/)) {
		event.respondWith(
			caches.match(event.request).then(cached => {
				if (cached) return cached;
				return fetch(event.request).then(response => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(STATIC_CACHE).then(cache => {
							cache.put(event.request, clone);
						});
					}
					return response;
				});
			})
		);
	}
});

// Limit cache size
async function limitCacheSize(cache, maxEntries) {
	const keys = await cache.keys();
	if (keys.length > maxEntries) {
		// Delete oldest entries
		const toDelete = keys.slice(0, keys.length - maxEntries);
		await Promise.all(toDelete.map(key => cache.delete(key)));
	}
}
