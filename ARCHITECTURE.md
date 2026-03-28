# Architecture

A YouTube frontend that filters out Shorts. SvelteKit + Svelte 5, deployed on Vercel serverless, with a multi-layer caching system (in-memory L1 + Upstash Redis L2 + smart revalidation) designed to stay under the YouTube Data API's 10,000 units/day quota while keeping perceived load times near-instant.

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Request Lifecycle](#request-lifecycle)
- [YouTube API Layer](#youtube-api-layer)
- [Caching System](#caching-system)
- [Smart Revalidation](#smart-revalidation)
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
│              │     │      │           │    │          │               │
│              │     │      │        L1 Map  │      L2 Redis           │
│              │     │      │           │    │                          │
│              │     │      │       isFresh? │                          │
│              │     │      │         │   └──┘                          │
│              │     │      │    yes? │ no? → head check → refresh()   │
│              │     │      │    return│       or full fetch            │
│              │     │      ▼         │                                │
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

| Page          | Blocking                  | Streamed                         |
| ------------- | ------------------------- | -------------------------------- |
| Home (anon)   | —                         | trending + categories            |
| Home (auth)   | —                         | subscriptions bar + curated feed |
| Subscriptions | —                         | subscriptions bar + subfeed      |
| Watch         | video details             | channel info, comments, related  |
| Channel       | channel details (for 404) | videos + subscription status     |
| Search        | —                         | search results                   |
| Playlist      | playlist metadata         | — (videos are blocking)          |
| Liked         | —                         | liked videos                     |
| My Playlists  | playlists list            | —                                |

---

## YouTube API Layer

**`src/lib/server/youtube.ts`** — Single module wrapping all YouTube Data API v3 calls. Every function follows a multi-tier pattern: check L1 cache → check L2 Redis → smart revalidation on stale hit → API fetch on true miss → normalize → cache.

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

### Curated Feed: Random Pool from Subscription History (Home Page, Auth)

The authenticated home page ("My Curated Feed") shows a weighted-random mix of videos drawn from across the user's entire subscription history — not just the most recent uploads. This surfaces videos the chronological feed would never show again.

#### Pool Building (`buildCuratedPool`)

The pool is built once and then **updated incrementally** — only newly subscribed channels are crawled. The cache stores both the video IDs and the playlist IDs used to build them, enabling cheap diffs.

**First build:**

1. **Reuse playlist IDs** — the subscription playlist ID list (`user:subfeed:plids:{userId}`) is shared with the subscription feed. If it's already cached, no extra API calls are needed.
2. **Warm page-1 batches from Redis** — a single `MGET` warms all channels' page-1 results from Redis into L1. If the subscription feed was recently loaded, this is entirely free.
3. **Skip page 1, crawl all remaining pages per channel in parallel** — page 1 videos are already in the chronological subscription feed. For each channel, the pool crawls pages 2 through exhaustion (up to 50 pages, i.e. up to ~500 videos per channel). This runs concurrently across all channels.
4. **Weighted shuffle (Efraimidis-Spirakis)** — each video is assigned a random key `Math.random() ^ (1 / weight)`, then the list is sorted descending. Weights: pages 2–3 → 1, pages 4–7 → 2, pages 8+ → 3. Older videos appear more often but newer videos can still surface.
5. **Cache for 30 days** — stored as `{ ids: string[], playlistIds: string[] }`. Redis stores at 60-day effective TTL.

**Incremental update (new subscription added):**

1. Diff current `playlistIds` against the stored `playlistIds`.
2. Crawl only the newly added channels (pages 2+ with weighted shuffle).
3. Prepend new video IDs to the existing pool — new channels get immediate presence.
4. Update stored `playlistIds`. No full rebuild needed.

**Removed subscriptions:** Videos from unsubscribed channels stay in the pool until the 30-day full rebuild. They're still valid YouTube videos and won't break the watch page.

#### Serving Pages (`getCuratedFeed`)

- On the **first call** (no cursor), a random `startOffset` is chosen: `Math.floor(Math.random() * pool.length)`. This makes the first videos shown different on every page reload.
- Subsequent calls advance linearly from that offset, guaranteeing no repeats within a session.
- The cursor is `{startOffset, consumed}` — simple and small (~40 bytes).

#### Cold Build Cost

| Scenario                                             | API units           |
| ---------------------------------------------------- | ------------------- |
| Page-1 batches all cached (sub feed loaded recently) | 0 for page 1        |
| Pages 2–N: 50 channels × avg 8 pages                 | ~400 units one-time |
| Amortized over 30 days                               | ~13 units/day       |

### Subscription Feed: K-Way Merge of All Channels (Subscriptions Page)

The `/subscriptions` page shows a chronological feed of recent uploads from all subscribed channels:

1. **Discover all subscriptions** — paginate through every page of the user's subscriptions (YouTube returns 50 per page). For a user with 200 subscriptions, this is 4 API calls — all cached at 4h (12h effective in L1).
2. **Resolve uploads playlists** — batch-fetch `contentDetails` for all channel IDs (50 per request). Each channel's uploads playlist ID is cached at `ch:uploads:{channelId}` for 24h. The full list of playlist IDs is cached at `user:subfeed:plids:{channelId}` for 4h.
3. **Warm all channel batches via MGET** — before fetching any channel's page-1 batch, a single Redis `MGET` pre-warms all of them in L1. This collapses N Redis round trips into 1, saving ~N-1 Redis commands per subfeed page load.
4. **Fetch initial batches** — fetch the 10 most recent uploads from each channel's playlist in parallel. Each batch is cached at `subfeed:batch:{playlistId}` for 2h with [smart revalidation](#smart-revalidation) — a 1-item head check determines if a channel has new uploads before doing a full re-fetch.
5. **K-way merge** — a linear scan picks the channel whose top buffered video has the most recent `publishedAt`. When a channel's buffer is exhausted, its next page is fetched on demand.
6. **Lazy hydration** — after selecting 20 videos, call `getVideoDetails()` on only those 20 IDs. Videos that were buffered but not selected are never hydrated — this is quota-efficient.
7. **Cursor-based pagination** — return a serializable cursor (`SubFeedCursor`: array of `{playlistId, offset, fetchToken, nextToken}`) that allows the client to resume the merge from where it left off.

**Why include all channels?** Earlier versions capped at 15 channels, which caused the subscription feed to miss content from many subscribed channels. The k-way merge is inherently lazy — it only fetches the next page from a channel when that channel's buffer is exhausted AND that channel is competitive in the merge order. Channels that haven't uploaded recently sit idle in the buffer and cost nothing beyond the initial 10-item fetch (which is cached aggressively).

**Why not fetch all videos first?** Fetching all recent videos from all channels and sorting would waste quota on videos the user never scrolls to. The merge approach is lazy — the total API calls scale with how far the user scrolls, not with how many channels they're subscribed to.

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

Applied to: `searchVideos`, `getTrending`, `getPlaylistVideos`, `getComments`, `fetchUploadsBatch`. If two concurrent SSR requests need the same trending page, they share one API call. The entry is cleaned up when the promise settles (success or failure). `getChannelVideos` benefits transitively — it delegates to `getPlaylistVideos` which has singleflight.

**Trade-off:** If the first caller's request fails, all concurrent waiters also receive the error. This is acceptable because they would have each received the same error independently.

### Detail Fetchers: Per-ID Caching with Batching

`getVideoDetails(ids[])`, `getChannelDetails(ids[])`, and `getPlaylistDetails(ids[])` follow the same three-layer lookup:

1. **L1 (in-memory):** Check `publicCache.get("video:{id}")` for each ID
2. **L2 (Redis MGET):** All L1 misses are batch-fetched in a single `warmBatchFromRedis()` call — one HTTP round trip regardless of how many IDs are missing. Hits are promoted back to L1.
3. **API:** Batch-fetch remaining IDs in groups of 50 (YouTube's max per request)

This means if 20 videos are requested and 15 are in L1, 3 are in Redis, only 2 hit the YouTube API — and the Redis lookup is a single MGET rather than 5 individual GETs. Per-ID caching is the cornerstone of cross-endpoint data sharing: a video encountered through trending, search, a channel page, or a playlist all maps to the same `video:{id}` cache entry.

### `warmBatchFromRedis` — Generic MGET Pre-Warming

`cache.warmBatchFromRedis<T>(entries[])` collapses N individual Redis GETs into one MGET:

1. For each key, check L1 first — L1 hits are returned immediately at zero cost
2. All L1 misses are collected and fetched in one Redis `MGET` call
3. Redis hits are written back to L1 and returned

This is used in three hot paths:

- **Detail fetchers** (`getVideoDetails`, `getChannelDetails`, `getPlaylistDetails`) — batch-warm all requested IDs before falling through to the API
- **Subscription feed init** — warm all channels' page-1 batches before the parallel fetch
- **Subscription feed resume** — warm all channels' current-page batches before resuming the k-way merge
- **Curated pool builder** — warm page-1 batches from Redis before starting the deep crawl

Without this, a 50-channel subfeed load on a cold serverless start would issue 50 sequential Redis GETs (~250ms). With MGET, it's 1 call (~5ms).

### Autocomplete

`getAutocompleteSuggestions(query)` hits YouTube's undocumented `suggestqueries-clients6.youtube.com` endpoint, which returns JSONP-format text. This does **not** consume API quota. Results are extracted via regex and cached for 10 minutes.

---

## Caching System

### Design Motivation

On Vercel serverless, each function invocation runs in an isolated container. In-memory state only persists while the container is "warm" (typically 5–15 minutes of inactivity). A pure in-memory cache has low hit rates because cold starts are frequent. Redis provides persistence across all invocations but adds ~1–5ms latency per call.

**Solution:** Two-layer cache with stale-while-revalidate semantics. L1 (in-memory) handles hot-path reads with zero latency. L2 (Redis) catches cold starts. Smart revalidation avoids redundant full re-fetches when data hasn't changed.

### `src/lib/server/cache.ts` — TTLCache

```
┌───────────────────────────────────────────────────────────────┐
│  TTLCache                                                     │
│                                                               │
│  .get(key)           → L1 Map (sync, 0ms) — serves stale     │
│  .getWithRedis(key)  → L1 Map → L2 Redis (async)             │
│  .set(key, val, ttl) → L1 Map (3x TTL) + L2 Redis (2x TTL)  │
│  .isFresh(key)       → true if within nominal TTL             │
│  .refresh(key, ttl)  → bump timestamps + Redis TTL, no fetch  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

Each cache entry stores two timestamps:

- **`freshUntil`** — data is "fresh" and returned without any revalidation check. Set to `now + TTL`.
- **`expiresAt`** — data is "stale but usable" and returned immediately, but callers should revalidate. Set to `now + TTL * 3`.

After `expiresAt`, the entry is evicted and a full fetch is required.

```
│← fresh (return immediately) →│← stale (return + head check) →│← expired (full fetch) →│
0                             TTL                              3×TTL                     ∞
```

- **L1:** `Map<string, {data, freshUntil, expiresAt}>`. Lazy eviction on read + background sweep every 5 minutes. Data lives for **3x nominal TTL** — this is the stale-while-revalidate window.
- **L2:** Upstash Redis via HTTP. Data lives for **2x nominal TTL** — longer than fresh window so cold starts still hit Redis. Reads are awaited; writes are fire-and-forget (don't block the response).
- **Promotion:** On L2 hit, the value is written to L1 as fresh (it's within Redis TTL, so it's recent enough).
- **Two singletons:** `publicCache` (prefix `pub:`) for shared data, `userCache` (prefix `usr:`) for per-session data.
- **Graceful degradation:** If Redis is not configured (local dev), all Redis operations are no-ops. The system behaves as pure L1.

### `src/lib/server/redis.ts` — Upstash Client

- Lazily initialized on first use
- Checks three env var names in order: `SHORTLESS_YT_CACHE_KV_URL`, `UPSTASH_REDIS_REST_URL`, `KV_REST_API_URL` (compatible with Vercel KV naming)
- `redisMGet(keys[])` — batch-fetches multiple keys in one HTTP round trip. Used heavily by `warmBatchFromRedis` to collapse N individual GETs into 1 — critical for subfeed (50+ channels) and detail fetchers.
- `redisMSet(entries[])` — batch-writes via Redis pipeline (fire-and-forget)
- All operations are wrapped in try/catch — Redis failures never crash the app
- **Circuit breaker:** If Redis returns a rate limit or daily quota error, `redisDisabledUntil` is set to `now + 5 minutes`. All subsequent Redis calls short-circuit (return null/empty) for that window. This prevents Redis quota exhaustion from cascading into a flood of YouTube API calls. The breaker resets automatically after 5 minutes.

### TTL Values

| Data                                    | Nominal TTL | L1 Effective (3x) | L2 Effective (2x) | Rationale                                                                                                                                |
| --------------------------------------- | ----------- | ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Video/channel/playlist details (per-ID) | 24 hours    | 72 hours          | 48 hours          | Metadata is essentially immutable (title, duration, description never change; view counts being slightly stale is acceptable)            |
| Trending videos                         | 2 hours     | 6 hours           | 4 hours           | Trending list rotates slowly; smart revalidation catches changes cheaply                                                                 |
| Playlist videos                         | 2 hours     | 6 hours           | 4 hours           | Channels upload at most a few times per day; head check catches new uploads                                                              |
| Subfeed upload batches                  | 2 hours     | 6 hours           | 4 hours           | Same as playlist videos — shared revalidation logic                                                                                      |
| Search results                          | 24 hours    | 72 hours          | 48 hours          | Search costs 100 units per call — long TTL strongly conserves quota; smart revalidation is impossible (search is always 100 units)       |
| Comments                                | 1 hour      | 3 hours           | 2 hours           | New comments appear, but stale comments are acceptable                                                                                   |
| Subscriptions list                      | 4 hours     | 12 hours          | 8 hours           | Users rarely subscribe/unsubscribe; count check catches changes                                                                          |
| Subscription status                     | 1 hour      | 3 hours           | 2 hours           | Reduced from 4h — subscribe/unsubscribe on the channel page reflects within 1h                                                           |
| User profile                            | 4 hours     | 12 hours          | 8 hours           | Avatar and channel name almost never change                                                                                              |
| Liked videos                            | 1 hour      | 3 hours           | 2 hours           | Users like videos more frequently; smart revalidation catches changes cheaply                                                            |
| User playlists (paginated)              | 24 hours    | 72 hours          | 48 hours          | Playlists change rarely; long TTL avoids redundant calls                                                                                 |
| My playlists (filtered flat list)       | 24 hours    | 72 hours          | 48 hours          | Same as above — full list rebuilt once per day                                                                                           |
| Curated feed pool                       | 30 days     | 90 days           | 60 days           | Expensive on first build; updated incrementally when new channels added (only new channels crawled); removed channels stay until rebuild |
| Autocomplete suggestions                | 10 minutes  | 30 minutes        | 20 minutes        | Low-cost (no API quota), freshness matters for UX                                                                                        |
| Channel uploads playlist ID             | 24 hours    | 72 hours          | 48 hours          | Immutable — a channel's uploads playlist ID never changes                                                                                |
| Video categories                        | 24 hours    | 72 hours          | 48 hours          | YouTube rarely adds/removes categories                                                                                                   |
| Shorts detection (Redis only)           | 7 days      | —                 | 7 days            | A video's Short status is permanent                                                                                                      |
| Subfeed playlist ID list                | 4 hours     | 12 hours          | 8 hours           | Shared between subscription feed and curated pool builder; changes only when user subscribes/unsubscribes                                |

### Cache Key Design

Human-readable, colon-separated, with `encodeURIComponent()` on user-controlled segments to prevent cache key collisions:

```
trending:20:                    — trending, category 20, first page
search:v:cats::medium:          — video search for "cats", medium duration
video:abc123                    — individual video detail (shared by all endpoints)
channel:UC123                   — individual channel detail
ch:uploads:UC123                — uploads playlist ID for a channel
plvideos:UU...:                 — playlist videos (shared by channel page, watch sidebar, playlist page)
subfeed:batch:UU...:            — subscription feed upload batch for a channel
user:subs:<channelId>:          — subscriptions keyed by user's YouTube channel ID
user:subfeed:plids:<channelId>  — all uploads playlist IDs for a user's subscriptions (shared by subfeed + curated pool)
user:curatedpool:<channelId>    — shuffled video ID pool for curated home feed (30-day TTL)
user:playlists:<channelId>:     — paginated user playlist results
user:myplaylists:<channelId>    — filtered flat list of user-created playlists
short2:abc123                   — shorts detection result (Redis only)
```

### Cache Unification Strategy

Every API call uses `maxResults` at the YouTube API maximum (50 for most endpoints, 100 for comments) to maximize data per quota unit. Overlapping data paths share cache entries:

| Data                | Shared By                                                           | Cache Key Pattern                        |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| Playlist videos     | Channel page, watch sidebar, playlist page, API pagination          | `plvideos:{playlistId}:{pageToken}`      |
| Uploads playlist ID | `getChannelVideos`, subscription feed init, `fetchUploadsBatch`     | `ch:uploads:{channelId}`                 |
| Video details       | All endpoints (trending, search, playlist, liked, channel, subfeed) | `video:{videoId}`                        |
| Channel details     | Watch page, channel page, search results                            | `channel:{channelId}`                    |
| Upload batches      | Subscription feed (initial + resume)                                | `subfeed:batch:{playlistId}:{pageToken}` |

`getTrending()` and `getLikedVideos()` populate the per-ID `video:{id}` cache, so videos encountered through trending or liked pages don't need re-fetching when viewed individually.

---

## Smart Revalidation

### The Problem

When a cache entry expires, the naive approach is to throw away the stale data and re-fetch everything from scratch. For a channel's uploads playlist, this means re-fetching all 50 video IDs and then re-hydrating each one — even though the channel likely uploaded 0 or 1 new videos since the last fetch. This is repeat work that wastes both API quota and user wait time.

### The Solution: Lightweight Head Checks

When a cache entry is **stale** (past `freshUntil` but before `expiresAt`), the system performs a cheap 1-item API call to check if the data has actually changed. If unchanged, it bumps the cache timestamps via `cache.refresh()` — no data re-fetch needed.

```
Cache hit?
  ├── Fresh (now < freshUntil) → return immediately, 0 API calls
  ├── Stale (freshUntil < now < expiresAt) → head check
  │     ├── Unchanged → cache.refresh(), return stale data, 1 API call
  │     └── Changed → incremental diff (playlist) or full re-fetch, 2 API calls
  └── Expired (now > expiresAt) → full re-fetch, N API calls
```

### Head Check Functions

Each data type has a purpose-built head check that costs exactly **1 API unit**:

| Function                                               | What It Checks                                                        | API Call                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `isPlaylistHeadUnchanged(playlistId, expectedFirstId)` | Whether the newest video in a playlist matches the cached first video | `playlistItems.list` with `maxResults=1`                       |
| `isTrendingHeadUnchanged(categoryId, expectedFirstId)` | Whether the #1 trending video matches the cached first video          | `videos.list` with `part=id, maxResults=1` (minimal bandwidth) |
| `isSubscriptionCountUnchanged(token, expectedTotal)`   | Whether the user's total subscription count has changed               | `subscriptions.list` with `part=id, maxResults=1`              |
| (liked ID-list diff — see below)                       | Whether the user's liked videos changed at all                        | `videos.list` with `part=id, myRating=like, maxResults=50`     |

### Where It Applies

Smart revalidation is applied to page 1 of list-based endpoints (where new content appears at the top):

- **`getPlaylistVideos`** — on stale page-1 hit, checks if the channel uploaded a new video. If changed, uses **incremental diff** (see below).
- **`fetchUploadsBatch`** — same head check for subscription feed batches
- **`getTrending`** — on stale page-1 hit, checks if the #1 trending video changed
- **`getSubscriptions`** — on stale page-1 hit, checks if subscription count changed
- **`getLikedVideos`** — on stale page-1 hit, fetches all 50 liked IDs (part=id only, 1 unit) and compares against cached. If identical, refreshes cache. If changed, uses **incremental diff** to only hydrate new IDs.

Paginated requests (page 2+) skip the head check and fall through to a full fetch, since new content doesn't appear mid-pagination.

### Incremental Diff (Playlist Videos)

When a head check detects that a playlist has changed, `getPlaylistVideos` avoids a full re-hydration of all 50 videos. Instead:

1. **Re-fetch playlist item IDs** — `playlistItems.list` with `maxResults=50` (1 API unit). This is unavoidable since we need the new ordering.
2. **Identify new videos** — compare the fresh video IDs against the cached result. Videos that already exist in the cache are reused directly.
3. **Hydrate only new videos** — call `getVideoDetails()` on only the truly new IDs (typically 1-5).
4. **Merge** — reconstruct the full result in the new API order, pulling cached `VideoItem` objects for known IDs and freshly hydrated objects for new ones.

```
Stale cache: [v1, v2, v3, ..., v50]  (all hydrated)
API re-fetch: [NEW, v1, v2, ..., v49] (just IDs)

Without incremental:  hydrate all 50 IDs → getVideoDetails(50 IDs)
With incremental:     hydrate 1 new ID  → getVideoDetails([NEW])
                      reuse v1-v49 from cache
```

**Why this matters:** `getVideoDetails()` batches IDs into groups of 50 and performs three-layer lookups (L1 → Redis → API). Even when all 49 old videos are L1 hits, the function still iterates through all IDs and builds filtered arrays. More importantly, if per-ID caches have expired (past the 72h hard expiry on cold starts), those 49 IDs would trigger Redis lookups or even API re-fetches. Incremental diff avoids all of this for known videos.

### Incremental Diff (Liked Videos)

Liked videos use a variant of the same strategy. The `videos.list?myRating=like` API returns full details directly (no separate hydration step), so the diff uses a two-phase approach:

1. **ID-only fetch** — `videos.list` with `part=id, myRating=like, maxResults=50` (1 API unit, ~2KB response). This returns just the video IDs in liked order.
2. **Compare** — if the ID list matches cached items exactly (same IDs, same order), refresh the cache TTL and return cached data.
3. **Diff + selective hydration** — if IDs differ, identify new IDs not in the cached result, call `getVideoDetails()` on only those, and merge with cached `VideoItem` objects.

This is strictly better than a 1-item head check because it catches ALL changes (not just position 0) at the same 1-unit cost, and enables incremental hydration on the changed path.

**Where incremental diff is NOT applied:**

- **`fetchUploadsBatch`** — stores lightweight refs `{id, publishedAt}` with no hydration step. Re-fetching 10 refs is negligible.
- **`getTrending`** — trending lists reorder chaotically (not just prepends), so cached items may not appear in the new result at all. Full re-fetch is correct.
- **Search** — relevance-ranked, volatile, and costs 100 units per call. Not cached with revalidation.

### Quota Impact

In the common case where nothing has changed (which is the vast majority of revalidations):

| Without Smart Revalidation                                         | With Smart Revalidation                                  | Savings                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `playlistItems.list` (1 unit) + `videos.list` for details (1 unit) | `playlistItems.list` with maxResults=1 (1 unit)          | 1 unit per revalidation                                             |
| `videos.list` trending full page (1 unit)                          | `videos.list` with part=id, maxResults=1 (1 unit)        | 0 units but much less bandwidth                                     |
| `subscriptions.list` full page (1 unit)                            | `subscriptions.list` with part=id, maxResults=1 (1 unit) | 0 units but much less bandwidth                                     |
| `videos.list` liked full page (1 unit)                             | `videos.list` with part=id, maxResults=50 (1 unit)       | 0 units but much less bandwidth; enables incremental diff on change |

When data HAS changed, incremental diff further reduces cost:

| Without Incremental Diff                                                 | With Incremental Diff                                                     | Savings                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------- |
| Head check (1) + playlistItems (1) + getVideoDetails for 50 IDs (1 unit) | Head check (1) + playlistItems (1) + getVideoDetails for 1-5 new IDs only | Skip hydration of 45-49 cached videos |

The real savings compound with the per-ID video cache: when a playlist hasn't changed, the head check avoids not only the playlist re-fetch but also the `getVideoDetails()` call that would follow it. With 24h per-ID TTLs, the video details are likely still cached — but without the head check, the system would still need to resolve all 50 IDs from the playlist before discovering they're cached.

### Error Handling

All head check functions return `true` (assume unchanged) on error. This is the safe default: if the YouTube API is having issues, it's better to serve slightly stale data than to waste quota on a full re-fetch that might also fail.

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

### `filterOutBrokenVideos(videos[])` — Pre-Filter

Runs before shorts filtering to avoid wasting HEAD probes on videos that would break the watch page. Removes:

- **Missing ID or title** — ghost entries from deleted/private videos
- **No thumbnail** — unavailable videos with no visual representation
- **Upcoming broadcasts** — `liveBroadcastContent === 'upcoming'`, these have no playable content yet and appear as blank cards
- **Zero views** — videos with 0 views are almost always unprocessed live stream replays (e.g., CNN/MSNBC just-ended streams with placeholder thumbnails), ghost entries, or just-created placeholders. No video in trending or subscription feeds should have 0 views.
- **Zero/empty duration, not live** — videos with no duration or zero duration (`P0D`/`PT0S`) that aren't live streams. These are typically unprocessed, broken, or premiere placeholders.

Additionally, the `getTrending()` function specifically filters out both `upcoming` AND `live` broadcasts from the trending feed, as live streams often appear as blank preview cards in the UI.

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
├── hooks.server.ts              # Rate limiting + session hydration + token refresh
├── app.html                     # HTML shell
├── lib/
│   ├── types.ts                 # Shared TypeScript interfaces
│   ├── server/
│   │   ├── youtube.ts           # YouTube API client (all API calls + smart revalidation)
│   │   ├── cache.ts             # Two-layer TTL cache (L1 + L2 + stale-while-revalidate + warmBatchFromRedis)
│   │   ├── redis.ts             # Upstash Redis client (MGET/MSET batching + circuit breaker)
│   │   ├── shorts.ts            # Shorts detection + broken video filtering pipeline
│   │   ├── auth.ts              # OAuth2 + AES-256-GCM sessions
│   │   └── env.ts               # Typed env var accessors
│   ├── components/
│   │   ├── Header.svelte        # Top nav with search + user menu (links: Subscriptions, Liked, My Playlists)
│   │   ├── VideoCard.svelte     # Video thumbnail card (vertical/horizontal)
│   │   ├── PlaylistCard.svelte  # Playlist thumbnail card
│   │   ├── ChannelBar.svelte    # Horizontal scrollable channel avatar strip
│   │   ├── VirtualFeed.svelte   # Infinite scroll grid (IntersectionObserver)
│   │   ├── SearchBar.svelte     # Search input with autocomplete
│   │   ├── CategoryChips.svelte # Category filter chips (anon home page)
│   │   ├── FilterChips.svelte   # Generic filter chips
│   │   ├── CommentSection.svelte
│   │   ├── VideoPlayer.svelte   # YouTube embed wrapper
│   │   ├── SlowLoadNotice.svelte # "Taking longer than usual" notice during streaming
│   │   ├── Skeleton.svelte      # YouTube-style loading skeleton placeholders
│   │   └── ReloadPrompt.svelte  # PWA update toast
│   └── stores/
│       ├── auth.ts              # Client-side auth state
│       └── columns.svelte.ts    # Responsive column count
└── routes/
    ├── +layout.server.ts        # User profile + quota status
    ├── +page.server.ts          # Home: curated feed (auth) or trending (anon)
    ├── subscriptions/           # Chronological subscription k-way merge feed (auth-gated)
    ├── watch/                   # Video player page
    ├── channel/[id]/            # Channel page
    ├── search/                  # Search results (manual "Load more" — search costs 100 units/call)
    ├── playlist/[id]/           # Playlist page
    ├── liked/                   # Liked videos (auth-gated)
    ├── playlists/               # User-created playlists grid (auth-gated, excludes LL/WL)
    └── api/
        ├── videos/              # Unified pagination endpoint (trending, channel, liked, search,
        │                        #   playlist, subfeed, curated)
        ├── suggest/             # Autocomplete proxy
        ├── comments/            # Comment pagination
        └── auth/                # Login, callback, logout
```
