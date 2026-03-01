# Architecture

A YouTube frontend that filters out Shorts. SvelteKit + Svelte 5, deployed on Vercel serverless, with a two-layer cache (in-memory + Upstash Redis) to stay under the YouTube Data API's 10,000 units/day quota.

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Request Lifecycle](#request-lifecycle)
- [YouTube API Layer](#youtube-api-layer)
- [Caching System](#caching-system)
- [Shorts Detection](#shorts-detection)
- [Authentication](#authentication)
- [Client-Side Architecture](#client-side-architecture)
- [Rate Limiting](#rate-limiting)
- [Service Worker / PWA](#service-worker--pwa)
- [Content Security Policy](#content-security-policy)

---

## High-Level Overview

```
┌──────────────┐     ┌─────────────────────────────────────────────────┐
│   Browser    │     │              Vercel Serverless                  │
│              │     │                                                 │
│  SvelteKit   │────▶│  hooks.server.ts (rate limit + session hydrate) │
│  client +    │     │        │                                        │
│  Service     │     │        ▼                                        │
│  Worker      │     │  +page.server.ts (SSR data loading)             │
│              │     │        │                                        │
│              │◀────│        ▼                                        │
│              │     │  youtube.ts ──▶ cache.ts ──▶ redis.ts           │
│              │     │      │              │            │               │
│              │     │      │           L1 Map      L2 Redis           │
│              │     │      │                                          │
│              │     │      ▼                                          │
│              │     │  YouTube Data API v3                             │
│              │     │      │                                          │
│              │     │      ▼                                          │
│              │     │  shorts.ts (HEAD probe filtering)               │
│              │     │                                                 │
└──────────────┘     └─────────────────────────────────────────────────┘
```

**Key constraint:** The YouTube Data API quota is 10,000 units/day. A single search costs 100 units. A video detail lookup costs 1 unit per video. Every design decision in this system is shaped by that budget.

**Tech stack:** SvelteKit 2, Svelte 5 (runes mode), TypeScript, Tailwind CSS v4, Vercel serverless, Upstash Redis, `@vite-pwa/sveltekit`.

---

## Request Lifecycle

Every request flows through `hooks.server.ts` before reaching route handlers:

1. **Rate limiting** — Per-IP sliding window (60 req/60s) on all `/api/*` routes. Returns 429 if exceeded.
2. **Session hydration** — Reads the encrypted session cookie, decrypts it (AES-256-GCM), and attaches the decoded tokens to `event.locals.session`.
3. **Silent token refresh** — If the access token is expired, `refreshAccessToken()` is called transparently. The refreshed session is re-encrypted and written back to the cookie. If refresh fails (revoked token), the session cookie is deleted and the user is effectively logged out.
4. **Route handler** — The `+page.server.ts` load function runs, fetching data from the YouTube API layer.
5. **Response** — SvelteKit streams the HTML. Blocking data is included in the initial payload; streamed promises resolve and patch in via the framework's streaming mechanism.

### Streaming Pattern

Pages return a mix of blocking and streamed data. Blocking data is needed for the initial render (e.g., video details for the player). Streamed data arrives later and fills in skeleton placeholders.

```typescript
// watch/+page.server.ts
return {
	video, // blocking — resolved before first byte
	streamed: {
		sidebarData: fetchSidebar(videoId) // non-blocking promise
	}
};
```

| Page        | Blocking                  | Streamed                        |
| ----------- | ------------------------- | ------------------------------- |
| Home (anon) | —                         | trending + categories           |
| Home (auth) | —                         | subscriptions + feed            |
| Watch       | video details             | channel info, comments, related |
| Channel     | channel details (for 404) | videos + subscription status    |
| Search      | —                         | search results                  |
| Playlist    | playlist metadata         | — (videos are blocking)         |
| Liked       | —                         | liked videos                    |

---

## YouTube API Layer

**`src/lib/server/youtube.ts`** — Single module (~1,700 lines) wrapping all YouTube Data API v3 calls. Every function follows the same pattern: check cache → call API → normalize response → cache result.

### Core Fetch Wrapper

`youtubeApiFetch(endpoint, params, accessToken?)` is the single point of contact with the YouTube API:

- Appends the API key for public requests; uses `Authorization: Bearer` for authenticated ones
- Detects `403 quotaExceeded` responses and sets a global `quotaExhaustedUntil` timestamp (calculated to next midnight Pacific Time, handling PST/PDT dynamically)
- All subsequent calls short-circuit with `QuotaExhaustedError` until the quota resets
- `isQuotaExhausted()` is checked in the root layout to surface a global banner

### The Two-Step Hydration Problem

YouTube's `search` endpoint only returns `snippet` (title, thumbnail, channel name) — it does NOT include `contentDetails` (duration) or `statistics` (view count). This means every search-based function requires two API calls:

1. `search` → get video/channel/playlist IDs
2. `videos`/`channels`/`playlists` with those IDs → hydrate full details

This applies to `searchVideos`, `searchChannels`, `searchPlaylists`, and `searchMixed`. It's an unavoidable API design limitation.

### Channel Videos: No Direct API

YouTube has no "list videos by channel" endpoint. `getChannelVideos()` resolves a channel ID to its uploads playlist ID, then delegates to `getPlaylistVideos()`:

1. Resolve channel ID → uploads playlist ID via `getUploadsPlaylistId()` (cached at `ch:uploads:{channelId}` for 24h — this never changes)
2. Delegate to `getPlaylistVideos(uploadsPlaylistId, pageToken)` which handles `playlistItems` fetch + `getVideoDetails()` hydration

This means channel uploads and explicit playlist pages share the same `plvideos:` cache. Visiting a channel page, watching a video from that channel (sidebar "more from channel"), and browsing the same uploads playlist all hit the same cache entries.

### Subscription Feed: K-Way Merge

YouTube has no subscription feed API endpoint. We build one manually:

1. Fetch user's subscriptions → up to 15 channel IDs (`SUBFEED_MAX_CHANNELS`)
2. Fetch each channel's uploads playlist ID in parallel (populates `ch:uploads:{channelId}` cache so subsequent `getChannelVideos()` calls skip the lookup)
3. Fetch the first 10 videos from each channel's uploads playlist in parallel (small batches keep response payloads light for the merge; the API cost is 1 unit per call regardless of batch size)
4. **K-way merge:** A min-heap picks the channel whose top buffered video has the most recent `publishedAt`. When a channel's buffer is exhausted, fetch its next page on demand.
5. After selecting 20 videos, call `getVideoDetails()` on only those 20 IDs — this is quota-efficient because we avoid hydrating videos that were buffered but not selected.
6. Return a serializable cursor (`SubFeedCursor`: array of `{playlistId, offset}`) for pagination.

**Why not fetch all videos first?** Fetching all recent videos from 15 channels and sorting would waste quota on videos the user never scrolls to. The heap approach is lazy — it only fetches the next page from a channel when that channel's buffer is exhausted AND that channel is competitive in the merge order.

### Request Coalescing (Singleflight)

A module-level `Map<string, Promise>` deduplicates concurrent identical API calls:

```typescript
const inflight = new Map<string, Promise<unknown>>();

function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const existing = inflight.get(key);
	if (existing) return existing as Promise<T>;
	const promise = fn().finally(() => inflight.delete(key));
	inflight.set(key, promise);
	return promise;
}
```

Applied to: `searchVideos`, `getTrending`, `getPlaylistVideos`, `getComments`. If two concurrent SSR requests need the same trending page, they share one API call. The entry is cleaned up when the promise settles (success or failure). `getChannelVideos` benefits transitively — it delegates to `getPlaylistVideos` which has singleflight.

**Trade-off:** If the first caller's request fails, all concurrent waiters also receive the error. This is acceptable because they would have each received the same error independently.

### Detail Fetchers: Per-ID Caching with Batching

`getVideoDetails(ids[])`, `getChannelDetails(ids[])`, and `getPlaylistDetails(ids[])` follow the same three-layer lookup:

1. **L1 (in-memory):** Check `publicCache.get("video:{id}")` for each ID
2. **L2 (Redis):** Batch-fetch all L1 misses via `publicCache.getWithRedis()` — promotes hits back to L1
3. **API:** Batch-fetch remaining IDs in groups of 50 (YouTube's max per request)

This means if 20 videos are requested and 15 are in L1, 3 are in Redis, only 2 hit the YouTube API.

### Autocomplete

`getAutocompleteSuggestions(query)` hits YouTube's undocumented `suggestqueries-clients6.youtube.com` endpoint, which returns JSONP-format text. This does **not** consume API quota. Results are extracted via regex and cached for 30 minutes.

---

## Caching System

### Design Motivation

On Vercel serverless, each function invocation runs in an isolated container. In-memory state only persists while the container is "warm" (typically 5–15 minutes of inactivity). A pure in-memory cache has low hit rates because cold starts are frequent. Redis provides persistence across all invocations but adds ~1–5ms latency per call.

**Solution:** Two-layer cache. L1 (in-memory) handles hot-path reads with zero latency. L2 (Redis) catches cold starts. Both layers are written simultaneously on cache miss.

### `src/lib/server/cache.ts` — TTLCache

```
┌─────────────────────────────────────────────────┐
│  TTLCache                                       │
│                                                 │
│  .get(key)          → L1 Map (sync, 0ms)        │
│  .getWithRedis(key) → L1 Map → L2 Redis (async) │
│  .set(key, val, ttl)→ L1 Map + L2 Redis (async) │
│                                                 │
└─────────────────────────────────────────────────┘
```

- **L1:** `Map<string, {data, expiresAt}>`. Lazy eviction on read + background sweep every 5 minutes.
- **L2:** Upstash Redis via HTTP. Reads are awaited; writes are fire-and-forget (don't block the response).
- **Promotion:** On L2 hit, the value is written back to L1 so subsequent reads within the same warm instance are instant.
- **Two singletons:** `publicCache` (prefix `pub:`) for shared data, `userCache` (prefix `usr:`) for per-session data.
- **Graceful degradation:** If Redis is not configured (local dev), all Redis operations are no-ops. The system behaves as pure L1.

### `src/lib/server/redis.ts` — Upstash Client

- Lazily initialized on first use
- Checks three env var names in order: `SHORTLESS_YT_CACHE_KV_URL`, `UPSTASH_REDIS_REST_URL`, `KV_REST_API_URL` (compatible with Vercel KV naming)
- `redisMGet(keys[])` — batch-fetches multiple keys in one HTTP round trip (used by shorts detection)
- `redisMSet(entries[])` — batch-writes via Redis pipeline (fire-and-forget)
- All operations are wrapped in try/catch — Redis failures never crash the app

### TTL Values

| Data                           | TTL        | Why                                    |
| ------------------------------ | ---------- | -------------------------------------- |
| Video/channel/playlist details | 1 hour     | Metadata changes infrequently          |
| Trending, search, comments     | 30 minutes | Balance freshness vs quota             |
| Autocomplete suggestions       | 30 minutes | Low-cost endpoint, no quota            |
| Channel uploads playlist ID    | 24 hours   | Never changes after creation           |
| Shorts detection (Redis only)  | 7 days     | A video's Short status is permanent    |
| Video categories               | 24 hours   | YouTube rarely adds/removes categories |

### Cache Key Design

Human-readable, colon-separated, with `encodeURIComponent()` on user-controlled segments to prevent cache key collisions:

```
trending:20:              — trending, category 20, first page
search:v:cats::medium:    — video search for "cats", medium duration
video:abc123              — individual video detail (shared by all endpoints)
channel:UC123             — individual channel detail
ch:uploads:UC123          — uploads playlist ID for a channel
plvideos:UU...:           — playlist videos (shared by channel page, watch sidebar, playlist page)
user:subs:<sha256-16>:    — subscriptions keyed by token hash prefix
short2:abc123             — shorts detection result (Redis only)
```

### Cache Unification Strategy

Every API call uses `maxResults` at the YouTube API maximum (50 for most endpoints, 100 for comments) to maximize data per quota unit. Overlapping data paths share cache entries:

| Data                | Shared By                                                  | Cache Key Pattern                   |
| ------------------- | ---------------------------------------------------------- | ----------------------------------- |
| Playlist videos     | Channel page, watch sidebar, playlist page, API pagination | `plvideos:{playlistId}:{pageToken}` |
| Uploads playlist ID | `getChannelVideos`, subscription feed init                 | `ch:uploads:{channelId}`            |
| Video details       | All endpoints (trending, search, playlist, liked, channel) | `video:{videoId}`                   |
| Channel details     | Watch page, channel page, search results                   | `channel:{channelId}`               |

`getTrending()` and `getLikedVideos()` populate the per-ID `video:{id}` cache, so videos encountered through trending or liked pages don't need re-fetching when viewed individually.

---

## Shorts Detection

**Problem:** YouTube Data API v3 has no `isShort` field. We need to detect Shorts ourselves.

**Solution:** HEAD probe to `https://www.youtube.com/shorts/{videoId}` with `redirect: 'manual'`:

- **HTTP 200** → the `/shorts/` page exists → it IS a Short
- **HTTP 303** → YouTube redirects away → it's a regular video

### `filterOutShorts(videos[])` — Six-Layer Pipeline

```
Input: VideoItem[]
  │
  ▼
Layer 1: Duration pre-filter (free, sync)
  │  duration > 180s → keep immediately (Shorts are max 60s)
  │
  ▼
Layer 1b: Short duration removal (free, sync)
  │  duration ≤ 60s → remove immediately (all Shorts are ≤60s)
  │  Catches vertical short-form videos that YouTube doesn't classify as Shorts
  │
  ▼
Layer 1c: Live stream pass-through (free, sync)
  │  duration = 0 AND views > 0 → live stream, keep
  │
  ▼
Layer 2: L1 in-memory cache (free, sync)
  │  Map<videoId, boolean>, up to 50,000 entries (~2.5MB)
  │  FIFO eviction: oldest 10% removed when full
  │
  ▼
Layer 3: L2 Redis batch lookup (1 HTTP call, ~1-5ms)
  │  Single MGET for ALL L1 misses at once
  │  Hits promoted back to L1
  │
  ▼
Layer 4: HEAD probes (network, last resort)
  │  10 concurrent probes, 3s timeout each
  │  Only 200/303 responses are cached; rate limits (429) are NOT cached
  │  Results cached in L1 + batch-written to Redis (7-day TTL)
  │
  ▼
Output: VideoItem[] (Shorts removed)
```

**Fail-safe:** On probe timeout or network error, the video is **kept** (not removed). It's safer to occasionally show a Short than to hide legitimate content. Failed probes and unexpected status codes (429, 403) are NOT cached, so they retry on the next request. This prevents "cache poisoning" where a rate-limited response permanently marks a Short as non-Short.

**Why batch Redis before probing?** On a cold serverless start, L1 is empty. Without L2, every video in a 50-item page would trigger a HEAD probe (~3s each, even with concurrency). With Redis MGET, most videos resolve in a single ~2ms HTTP call, and only truly unknown videos need probing.

---

## Authentication

### OAuth2 Authorization Code Flow

```
Browser                    Server                         Google
  │                          │                              │
  │  GET /api/auth/login     │                              │
  │─────────────────────────▶│                              │
  │                          │  Generate random state       │
  │                          │  Set state cookie (10min)    │
  │  302 → Google consent    │                              │
  │◀─────────────────────────│                              │
  │                          │                              │
  │  User grants consent     │                              │
  │─────────────────────────────────────────────────────────▶│
  │                          │                              │
  │  302 → /api/auth/callback?code=X&state=Y                │
  │◀─────────────────────────────────────────────────────────│
  │                          │                              │
  │  GET /callback           │                              │
  │─────────────────────────▶│                              │
  │                          │  timingSafeEqual(state)      │
  │                          │  Exchange code for tokens    │
  │                          │  ──────────────────────────▶ │
  │                          │  ◀────── {access, refresh}   │
  │                          │  Encrypt session (AES-GCM)   │
  │                          │  Set session cookie (30d)    │
  │  302 → /                 │                              │
  │◀─────────────────────────│                              │
```

### Session Encryption (AES-256-GCM)

The session cookie contains encrypted tokens — even though the cookie is `httpOnly`, encryption ensures tokens are opaque to any party that intercepts the cookie value.

- **Key derivation:** `HMAC-SHA256(AUTH_SECRET, "shortless-session-encryption")` → 32 bytes. Memoized per process.
- **Encryption:** Fresh 12-byte random IV per `encryptSession()` call. AES-256-GCM produces ciphertext + 16-byte auth tag.
- **Cookie format:** `<base64url-iv>.<base64url-tag>.<base64url-ciphertext>`
- **Integrity:** The GCM auth tag detects any tampering. Decryption returns `null` on failure.

### Logout

- **POST only** — prevents CSRF (a GET logout could be triggered by an `<img>` tag)
- **Token revocation** — fire-and-forget POST to `https://oauth2.googleapis.com/revoke` with the refresh token, so stolen tokens become permanently invalid
- **Cookie deletion** — the session cookie is cleared regardless of revocation success

### Scope

`youtube.readonly` — can read subscriptions, liked videos, playlists, but cannot modify anything. Users can verify this on Google's consent screen.

---

## Client-Side Architecture

### VirtualFeed Component

Generic infinite-scroll grid. Despite the name, it does NOT do DOM virtualization (all items stay in the DOM — profiling showed this is fine for ~100+ video cards).

- An `IntersectionObserver` on a sentinel element fires `onLoadMore()` when the user scrolls within 500px of the bottom
- Column count comes from `useColumns()` — a reactive store that responds to `window.resize` using Tailwind breakpoints: `<640px` → 1, `640px+` → 2, `1024px+` → 3, `1280px+` → 4

### Generation Counters (Stale Callback Prevention)

SvelteKit uses streaming — `$effect` blocks fire `.then()` on streamed promises. On fast navigation, a stale promise from the previous page could resolve and overwrite the new page's state.

```typescript
let generation = 0;

$effect(() => {
	const gen = ++generation;
	data.streamed.channelData.then((result) => {
		if (gen !== generation) return; // stale — discard
		allVideos = result.videos;
	});
});
```

Each navigation increments the counter. When the promise resolves, it checks if it's still the current generation. Used on: home (x2), channel, liked, search, watch.

### Fill-Page Loading (Server-Side)

After filtering out Shorts, a single API page might return 0 usable videos (e.g., a channel that posts mostly Shorts). The server loops until it has enough content or runs out of pages:

```typescript
const TARGET_INITIAL_VIDEOS = 12;

while (collected.length < TARGET_INITIAL_VIDEOS && hasMore) {
	const result = await getChannelVideos(channelId, currentToken);
	const filtered = await filterOutShorts(filterOutBrokenVideos(result.items));
	collected.push(...filtered);
	currentToken = result.pageInfo.nextPageToken;
	hasMore = !!currentToken;
}
```

There is no artificial page limit — the loop continues until enough non-short videos are collected or the channel's uploads are exhausted. This handles Shorts-heavy channels like Vsauce where hundreds of consecutive videos may be Shorts.

**Exception:** Search pages only fetch 1 page because each search call costs 100 quota units (vs 1–3 units for other endpoints).

### Client-Side Pagination Retry

The same problem exists client-side. `loadMore()` functions retry up to `MAX_CLIENT_PAGES = 6` times when a page returns empty after server-side filtering:

```typescript
for (let page = 0; page < MAX_CLIENT_PAGES && token; page++) {
	const res = await fetch(`/api/videos?source=channel&pageToken=${token}`);
	if (!res.ok) break;
	const json = await res.json();
	if (json.items.length > 0) allVideos.push(...json.items);
	token = json.nextPageToken;
	if (json.items.length > 0) break; // got results, stop retrying
}
```

### Array Mutations

Svelte 5's reactivity system uses proxies that detect mutations on existing arrays. `.push()` is used instead of spread (`[...old, ...new]`) for pagination updates — spread creates a new array reference which triggers unnecessary re-renders of the entire list.

---

## Rate Limiting

Per-IP sliding-window rate limiter in `hooks.server.ts`:

- **Window:** 60 seconds, **Limit:** 60 requests per IP
- **Scope:** All `/api/*` routes (auth, videos, search, comments, etc.)
- **Storage:** Module-level `Map<string, {count, windowStart}>`
- **Cleanup:** Background interval every 2 minutes sweeps stale entries
- **Rejection:** 429 JSON response with `Retry-After: 60` header

**Caveat on serverless:** Each Vercel function instance has its own rate limit map. A determined attacker could bypass this by hitting different instances. This is documented as best-effort; for hard guarantees, Upstash Redis rate limiting would be needed.

---

## Service Worker / PWA

Generated at build time by `@vite-pwa/sveltekit` (Workbox-based), configured in `vite.config.ts`:

- **Registration type:** `prompt` — the SW does NOT auto-activate. `ReloadPrompt.svelte` shows an "Update available" toast, letting the user decide when to reload.
- **Precaching:** All static assets (JS bundles, CSS, images, fonts) via `workbox.globPatterns`.
- **Update checks:** Every 15 minutes via `registration.update()`, and on `document.visibilitychange` (catches deployments while the app was backgrounded on mobile).
- **Manifest:** `display: 'standalone'`, dark theme, three icon sizes including maskable.

---

## Content Security Policy

Configured declaratively in `svelte.config.js`:

| Directive     | Value                                                           | Why                                           |
| ------------- | --------------------------------------------------------------- | --------------------------------------------- |
| `script-src`  | `self`                                                          | No inline scripts, no CDN scripts             |
| `img-src`     | `self`, `*.ytimg.com`, `*.ggpht.com`, `*.googleusercontent.com` | YouTube thumbnails + Google profile images    |
| `frame-src`   | `https://www.youtube.com`                                       | YouTube embed iframe (video player)           |
| `connect-src` | `self`                                                          | All API calls go to same origin               |
| `form-action` | `self`                                                          | Prevents form submissions to external domains |
| `base-uri`    | `self`                                                          | Prevents `<base>` tag injection               |
| `object-src`  | `none`                                                          | Blocks Flash/plugins                          |

---

## Project Structure

```
src/
├── hooks.server.ts              # Rate limiting + session hydration
├── app.html                     # HTML shell
├── lib/
│   ├── types.ts                 # Shared TypeScript interfaces
│   ├── server/
│   │   ├── youtube.ts           # YouTube API client (all API calls)
│   │   ├── cache.ts             # Two-layer TTL cache (L1 + L2)
│   │   ├── redis.ts             # Upstash Redis client
│   │   ├── shorts.ts            # Shorts detection pipeline
│   │   ├── auth.ts              # OAuth2 + AES-256-GCM sessions
│   │   └── env.ts               # Typed env var accessors
│   ├── components/
│   │   ├── Header.svelte        # Top nav with search + user menu
│   │   ├── VideoCard.svelte     # Video thumbnail card (vertical/horizontal)
│   │   ├── VirtualFeed.svelte   # Infinite scroll grid
│   │   ├── SearchBar.svelte     # Search input with autocomplete
│   │   ├── CategoryChips.svelte # Category filter chips
│   │   ├── CommentSection.svelte
│   │   ├── VideoPlayer.svelte   # YouTube embed wrapper
│   │   └── ReloadPrompt.svelte  # PWA update toast
│   └── stores/
│       ├── auth.ts              # Client-side auth state
│       └── columns.svelte.ts    # Responsive column count
└── routes/
    ├── +layout.server.ts        # User profile + quota status
    ├── +page.server.ts          # Home (trending or subfeed)
    ├── watch/                   # Video player page
    ├── channel/[id]/            # Channel page
    ├── search/                  # Search results
    ├── playlist/[id]/           # Playlist page
    ├── liked/                   # Liked videos (auth-gated)
    └── api/
        ├── videos/              # Unified pagination endpoint
        ├── suggest/             # Autocomplete proxy
        ├── comments/            # Comment pagination
        └── auth/                # Login, callback, logout
```
