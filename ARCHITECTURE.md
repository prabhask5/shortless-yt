# Architecture

This document describes the backend and full-stack architecture of **Shortless YT**, a SvelteKit application that serves as a YouTube frontend with automatic Shorts filtering. It is written for developers with zero prior knowledge of the codebase.

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Request Lifecycle](#request-lifecycle)
- [Server-Side Architecture](#server-side-architecture)
  - [API Routes](#api-routes)
  - [YouTube API Wrapper](#youtube-api-wrapper)
  - [Caching Layer](#caching-layer)
  - [Shorts Detection & Filtering](#shorts-detection--filtering)
  - [Authentication (OAuth 2.0 + PKCE)](#authentication-oauth-20--pkce)
  - [Rate Limiting](#rate-limiting)
  - [Logging](#logging)
- [Client-Side Architecture](#client-side-architecture)
  - [Routing & Pages](#routing--pages)
  - [Components](#components)
  - [Stores (Client State)](#stores-client-state)
  - [Service Worker & PWA](#service-worker--pwa)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Caching Strategy (Two Layers)](#caching-strategy-two-layers)
- [Quota Management](#quota-management)
- [Security Model](#security-model)

---

## High-Level Overview

```
                         +------------------+
                         |   Browser/PWA    |
                         |  (SvelteKit CSR) |
                         +--------+---------+
                                  |
                         HTTP (fetch /api/*)
                                  |
                         +--------v---------+
                         |  SvelteKit Server |
                         |  (Node.js/Vite)  |
                         +--------+---------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
     +--------v------+  +--------v------+  +--------v--------+
     | YouTube Data  |  | Google OAuth  |  | Google Userinfo  |
     | API v3        |  | Token Endpoint|  | Endpoint         |
     +---------------+  +---------------+  +-----------------+
```

The application follows a **backend-for-frontend (BFF)** pattern:

1. **The browser never talks to YouTube directly.** All YouTube API calls are made server-side through SvelteKit API routes (`/api/*`). This keeps the API key secret and enables server-side caching.
2. **The SvelteKit server** acts as a thin proxy that adds caching, rate limiting, Shorts filtering, and authentication on top of YouTube's raw API.
3. **The service worker** adds a second caching layer on the client side for offline support and reduced network requests.

---

## Request Lifecycle

Here's what happens when a user searches for "cooking tutorials":

```
1. User types "cooking tutorials" and hits Enter
2. Browser → GET /api/search?q=cooking+tutorials
3. SvelteKit API route handler:
   a. Rate limiter checks IP + endpoint → allowed
   b. Calls searchVideos("cooking tutorials") in youtube-api.ts
   c. youtube-api.ts checks in-memory cache → miss
   d. Calls YouTube search.list API (100 quota units)
   e. Gets video IDs from search results
   f. Calls YouTube videos.list to hydrate full metadata (1 quota unit)
   g. Runs Shorts detection on each video (duration + keyword heuristics)
   h. Filters out detected Shorts
   i. If >50% were Shorts, fetches additional pages (backfill)
   j. Enriches remaining videos with channel thumbnails
   k. Caches result for 10 minutes
   l. Returns JSON response
4. Service worker intercepts response:
   a. Stores in API_CACHE with TTL metadata
   b. Passes response to the page
5. Svelte page renders the video grid
```

---

## Server-Side Architecture

### API Routes

All API routes live under `src/routes/api/` and follow SvelteKit's file-based routing convention. Each `+server.ts` file exports a `GET` function that handles incoming requests.

| Route | Purpose | Auth Required |
|---|---|---|
| `/api/search` | Search videos (with Shorts filtering + backfill) | No |
| `/api/videos` | Get video details by ID(s) | No |
| `/api/recommended` | Home page feed (trending or subscription-based) | Optional |
| `/api/related` | Related videos for the watch page | No |
| `/api/comments` | Video comments with pagination | No |
| `/api/channel` | Channel metadata (banner, stats) | No |
| `/api/channel/videos` | Channel's uploaded videos | No |
| `/api/playlist` | Playlist metadata | No |
| `/api/playlist/videos` | Playlist video items | No |
| `/api/subscriptions` | User's subscription list | Yes |
| `/api/subscriptions/check` | Check if subscribed to a channel | Yes |
| `/api/auth/login` | Initiates OAuth flow (generates PKCE + redirects) | No |
| `/api/auth/callback` | OAuth callback (exchanges code for tokens) | No |
| `/api/auth/me` | Get current user profile from session | No |
| `/api/auth/logout` | Clears session cookie | No |

**Pattern:** Every API route follows this structure:
```
1. Extract query parameters from the URL
2. (If auth required) Validate session cookie → get access token
3. Call the appropriate function from youtube-api.ts
4. Return JSON response (or error with appropriate status code)
```

Rate limiting is applied in each route handler before calling the YouTube API wrapper.

### YouTube API Wrapper

**File:** `src/lib/server/youtube-api.ts` (~950 lines)

This is the core data layer. It wraps every YouTube Data API v3 call with:

- **Caching** — Each function checks the in-memory cache before making API calls. Cache keys include all parameters that affect the response (query, pageToken, region, etc.).
- **Shorts filtering** — Every function that returns videos runs them through the Shorts detector and removes flagged videos from results.
- **Channel thumbnail enrichment** — Video results are enriched with channel avatar URLs via a batched, cache-aware lookup (up to 50 channels per API call).
- **Backfill logic** — `searchVideos()` will fetch additional API pages when too many results are Shorts, ensuring the user always sees at least 20 results.

**Key functions:**

| Function | What It Does | Quota Cost |
|---|---|---|
| `searchVideos()` | Search with Shorts filter + backfill | 100+ units |
| `getVideosByIds()` | Hydrate video IDs with full metadata | 1 unit |
| `getRelatedVideos()` | Find related videos (title-based search workaround) | 100+ units |
| `getComments()` | Fetch comment threads for a video | 1 unit |
| `getCommentReplies()` | Fetch replies to a comment | 1 unit |
| `getTrendingVideos()` | Most popular videos by region | 1 unit |
| `getSubscriptionFeed()` | Build personalized feed from subscriptions | ~6 units |
| `getChannelInfo()` | Channel metadata | 1 unit |
| `getChannelVideos()` | Channel uploads (via playlist API) | 1-2 units |
| `getPlaylistInfo()` | Playlist metadata | 1 unit |
| `getPlaylistVideos()` | Playlist items | 1-2 units |
| `searchAll()` | Mixed search (videos + channels + playlists) | 100+ units |

**Two fetch functions:**
- `ytFetch()` — Uses the server API key (for public data)
- `ytFetchAuth()` — Uses the user's OAuth Bearer token (for user-scoped data like subscriptions)

### Caching Layer

**File:** `src/lib/server/cache.ts`

An in-memory TTL cache using a `Map<string, CacheEntry>`. Each entry stores:
- `data` — The cached value (any serializable type)
- `timestamp` — When the entry was created
- `ttl` — How long the entry is considered "fresh" (milliseconds)

**Freshness model (3 states):**

```
|------ fresh ------|------ stale ------|--- evicted ---|
0                  TTL               TTL × 2           ∞
```

1. **Fresh** (`age < TTL`): Returned immediately, no API call.
2. **Stale** (`TTL < age < TTL × 2`): Returned as fallback while a fresh fetch is triggered. This implements a stale-while-revalidate pattern.
3. **Evicted** (`age > TTL × 2`): Deleted from cache, forces a fresh API call.

**TTL values by data type:**

| Data Type | TTL | Rationale |
|---|---|---|
| `search` | 10 min | Search results change frequently |
| `video` | 12 hours | Video metadata is relatively stable |
| `comments` | 5 min | Comments are actively posted |
| `trending` | 30 min | Trending updates slowly |
| `channel` | 24 hours | Channel info rarely changes |
| `channelThumbnail` | 24 hours | Avatars rarely change |
| `subscriptions` | 1 hour | Sub list changes infrequently |

**Eviction:** When the cache reaches 5,000 entries, it first evicts all expired entries. If none are expired, it evicts the oldest 20%.

### Shorts Detection & Filtering

**File:** `src/lib/server/shorts-filter.ts`

YouTube's API has no `isShort` field, so this module uses a multi-signal heuristic:

```
detectShort(durationSeconds, title, description, tags)
         │
         ├─ Duration ≤ 60s? ──────────────────────→ IS SHORT (strong signal)
         │
         ├─ Duration ≤ configurable max (60-120s)
         │   AND keyword match (#shorts, ytshorts)? → IS SHORT
         │
         ├─ Duration = 0 (unknown)
         │   AND keyword match? ─────────────────→ IS SHORT (weak signal)
         │
         └─ Otherwise ──────────────────────────→ NOT SHORT
```

**Keyword matching** checks:
1. Video title (full, case-insensitive)
2. Video description (first 500 chars only, for performance)
3. Video tags (if present)

**Backfill mechanism** (in `searchVideos()`): If more than 50% of a search page's results are Shorts, up to 3 additional API pages are fetched to maintain a minimum of 20 visible results.

**`parseDuration()`** converts ISO 8601 duration strings (e.g., `"PT5M30S"`) to seconds for the duration check.

### Authentication (OAuth 2.0 + PKCE)

**File:** `src/lib/server/auth.ts`

Implements Google OAuth 2.0 Authorization Code flow with PKCE:

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  Browser  │     │ SvelteKit    │     │   Google    │
│           │     │ Server       │     │   OAuth     │
└─────┬─────┘     └──────┬───────┘     └──────┬──────┘
      │  GET /api/auth/login              │           │
      │──────────────────────>│           │           │
      │                       │ Generate PKCE pair    │
      │                       │ Store verifier        │
      │  302 Redirect         │           │           │
      │<──────────────────────│           │           │
      │                       │           │           │
      │  User grants consent at Google    │           │
      │──────────────────────────────────────────────>│
      │                       │           │           │
      │  302 Redirect with code + state  │           │
      │<──────────────────────────────────────────────│
      │                       │           │           │
      │  GET /api/auth/callback?code=...&state=...   │
      │──────────────────────>│           │           │
      │                       │ Verify state          │
      │                       │ Retrieve verifier     │
      │                       │ Exchange code+verifier │
      │                       │──────────────────────>│
      │                       │  Access + Refresh token│
      │                       │<──────────────────────│
      │                       │ Fetch user profile    │
      │                       │──────────────────────>│
      │                       │  Profile data         │
      │                       │<──────────────────────│
      │  Set-Cookie: session_id=<signed>  │           │
      │<──────────────────────│           │           │
```

**Session cookies:**
- Format: `<base64url-JSON-payload>.<HMAC-SHA256-signature>`
- Signed with the OAuth client secret (HMAC-SHA256)
- `httpOnly` flag prevents JavaScript access
- Contains: access token, refresh token, expiry timestamp, user profile
- 7-day max age; access tokens auto-refresh when expired

**PKCE state storage:**
- In-memory `Map<state, { codeVerifier, createdAt }>`
- Auto-expires after 5 minutes
- Single-use (consumed on callback)

### Rate Limiting

**File:** `src/lib/server/rate-limiter.ts`

Fixed-window rate limiter keyed by `IP:endpoint`:

- **Window:** 60 seconds
- **Per-endpoint limits** (requests per minute):
  - Search/Related: 30
  - Videos: 60
  - Comments: 40
  - Auth endpoints: 10
  - Default: 60
- **Cleanup:** Expired entries are purged every 60 seconds via `setInterval`

Returns `{ allowed: boolean, retryAfter?: number }` so API routes can return a proper `429` with `Retry-After` header.

### Logging

**File:** `src/lib/server/logger.ts`

Structured logging for debugging and monitoring:
- `logApiCall()` — Logs every YouTube API call (endpoint, params, cache hit/miss)
- `logShortsFilter()` — Logs how many Shorts were filtered and how many backfill pages were needed
- `logError()` — Logs errors with structured context
- `logAuthEvent()` — Logs auth events (login, token refresh, etc.)

---

## Client-Side Architecture

### Routing & Pages

SvelteKit's file-based routing maps URLs to Svelte components:

| URL Pattern | Page File | Description |
|---|---|---|
| `/` | `+page.svelte` | Home (trending or subscription feed) |
| `/watch/[id]` | `watch/[id]/+page.svelte` | Video player + comments + related |
| `/results?q=...` | `results/+page.svelte` | Search results |
| `/channel/[id]` | `channel/[id]/+page.svelte` | Channel page with videos |
| `/playlist/[id]` | `playlist/[id]/+page.svelte` | Playlist viewer |
| `/subscriptions` | `subscriptions/+page.svelte` | Subscription management |
| `/settings` | `settings/+page.svelte` | App settings |
| `/about` | `about/+page.svelte` | About page |
| `/privacy` | `privacy/+page.svelte` | Privacy policy |
| `/terms` | `terms/+page.svelte` | Terms of service |

**Infinite scroll** is implemented on the home page, search results, channel videos, and playlist videos using `IntersectionObserver` with a 400px root margin for preloading. A 500ms debounce cooldown and `!loading` guard prevent rapid-fire pagination requests.

### Components

All reusable UI components live in `src/lib/components/`:

**Video display:**
- `VideoGrid.svelte` — CSS grid container that renders `VideoCard` children
- `VideoCard.svelte` — Thumbnail + title + channel + view count card
- `VideoMeta.svelte` — Full video metadata (title, channel, stats, actions)
- `WatchPlayer.svelte` — YouTube IFrame Player API wrapper
- `Description.svelte` — Collapsible video description

**Comments:**
- `CommentList.svelte` — Comment section with sort toggle and pagination
- `CommentItem.svelte` — Individual comment with reply thread support

**Navigation:**
- `TopBar.svelte` — Header bar with logo, search, and auth button
- `SideNav.svelte` — Desktop sidebar navigation
- `BottomNav.svelte` — Mobile bottom tab bar
- `SearchBox.svelte` — Search input with history and autocomplete

**Cards:**
- `ChannelCard.svelte` — Channel result card in mixed search
- `PlaylistCard.svelte` — Playlist result card in mixed search
- `RelatedList.svelte` — Sidebar list of related videos (watch page)

**Utility:**
- `LoadingSkeletons.svelte` — Skeleton placeholder animations
- `ErrorBanner.svelte` — Error message display
- `OfflineBanner.svelte` — Offline connectivity indicator
- `InstallBanner.svelte` — iOS PWA install prompt
- `UpdateToast.svelte` — Service worker update notification
- `PremiumHelpModal.svelte` — YouTube Premium troubleshooting guide
- `ShortsBlockPage.svelte` — Displayed when navigating to a Shorts URL

### Stores (Client State)

Svelte 5 rune-based stores in `src/lib/stores/`:

- **`auth.ts`** — Authentication state (`$state` rune). Holds user profile, loading state, login/logout functions. Syncs with `/api/auth/me` on app load.
- **`theme.ts`** — Light/dark theme toggle. Persisted to `localStorage`, applies `data-theme` attribute to `<html>`.
- **`search-history.ts`** — Recent search queries. Persisted to `localStorage`, max 10 entries, provides add/remove/clear functions.

### Service Worker & PWA

**File:** `static/sw.js`

The service worker implements a multi-cache strategy for offline support:

| Cache | Strategy | Contents |
|---|---|---|
| `ASSET_CACHE` | Cache-first (immutable) | Hashed JS/CSS bundles from Vite builds |
| `SHELL_CACHE` | Cache-first (versioned) | App shell (`/`, `favicon.svg`, `manifest.webmanifest`) |
| `API_CACHE` | Cache-first with TTL | API responses (`/api/*`) |
| `THUMB_CACHE` | Cache-first with TTL | YouTube thumbnails (`i.ytimg.com`) |

**Version management:**
- `APP_VERSION` is auto-updated by the Vite plugin (`serviceWorkerVersion` in `vite.config.ts`) on every build
- On install, the SW precaches the app shell and notifies existing clients
- On activate, old versioned shell caches are cleaned up
- Clients receive `SW_UPDATED` messages that trigger the `UpdateToast` component

**Asset manifest:**
- The Vite plugin generates `asset-manifest.json` listing all immutable build assets
- The SW fetches this manifest on install and precaches all listed assets
- This ensures the entire app shell loads offline after the first visit

---

## Data Flow Diagrams

### Home Page Load (Authenticated User)

```
+page.svelte
  │
  ├─ onMount → fetch /api/recommended
  │               │
  │               ├─ getSubscriptionFeed()
  │               │     │
  │               │     ├─ Fetch user's subscribed channel IDs (cached 1h)
  │               │     ├─ Select ~4 channels (deterministic rotation via offset)
  │               │     ├─ Fetch recent uploads from each channel (parallel)
  │               │     ├─ Hydrate all video IDs in one batch
  │               │     ├─ Filter Shorts
  │               │     ├─ Fisher-Yates shuffle results
  │               │     └─ Enrich with channel thumbnails
  │               │
  │               └─ Return { items, nextPageToken }
  │
  ├─ Render VideoGrid → VideoCard[]
  │
  └─ IntersectionObserver (400px margin)
      └─ On intersect → fetch /api/recommended?offset=4
                          └─ Same flow, different channel selection
```

### Watch Page Load

```
watch/[id]/+page.svelte
  │
  ├─ Load video metadata: fetch /api/videos?ids={id}
  │
  ├─ Initialize YouTube IFrame Player (WatchPlayer.svelte)
  │
  ├─ Load comments: fetch /api/comments?videoId={id}
  │
  └─ Load related: fetch /api/related?videoId={id}
       └─ getRelatedVideos()
            ├─ Fetch source video title
            ├─ Extract main topic (text before first - or |)
            ├─ Search for that topic
            ├─ Exclude source video from results
            ├─ Filter Shorts
            └─ Enrich with channel thumbnails
```

---

## Caching Strategy (Two Layers)

```
┌─────────────────────────────────────────────────────┐
│                    Browser                           │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ Service Worker Cache (sw.js)                  │  │
│  │  - API responses with client-side TTL         │  │
│  │  - Thumbnails (7-day TTL)                     │  │
│  │  - Immutable assets (permanent)               │  │
│  │  - App shell (versioned per deploy)           │  │
│  └───────────────────┬───────────────────────────┘  │
│                      │ cache miss                    │
│                      ▼                               │
│              Network Request                         │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│              SvelteKit Server                         │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ In-Memory Cache (cache.ts)                     │  │
│  │  - Search results (10 min TTL)                 │  │
│  │  - Video metadata (12 hour TTL)                │  │
│  │  - Comments (5 min TTL)                        │  │
│  │  - Channel info (24 hour TTL)                  │  │
│  │  - Max 5,000 entries with LRU-like eviction    │  │
│  └───────────────────┬────────────────────────────┘  │
│                      │ cache miss                     │
│                      ▼                                │
│           YouTube Data API v3                         │
└──────────────────────────────────────────────────────┘
```

A request can be served from three levels:
1. **Service worker cache** — instant, no network (offline-capable)
2. **Server in-memory cache** — fast, no YouTube API call (saves quota)
3. **YouTube API** — slowest, costs quota units

---

## Quota Management

YouTube Data API v3 has a daily quota of 10,000 units (free tier). The app minimizes usage through:

1. **Server-side caching** — Most responses are served from cache, avoiding redundant API calls
2. **Per-video caching** — Individual videos are cached for 12 hours; hydration calls skip already-cached IDs
3. **Batch operations** — Channel thumbnails are fetched in batches of up to 50 (API max)
4. **Client-side caching** — The service worker prevents duplicate requests from reaching the server at all
5. **Playlist API for channel videos** — Using `playlistItems.list` (1 unit) instead of `search.list` (100 units) for channel video listings

**Most expensive operations:**
- `search.list` = 100 units per call (search, related videos, mixed search)
- Everything else = 1 unit per call

---

## Security Model

| Layer | Mechanism | Purpose |
|---|---|---|
| API key protection | Server-side only (`$env/dynamic/private`) | Key never exposed to browser |
| Authentication | OAuth 2.0 + PKCE (RFC 7636) | Prevents auth code interception |
| CSRF protection | Random `state` parameter in OAuth flow | Prevents cross-site request forgery |
| Session integrity | HMAC-SHA256 signed cookies | Detects cookie tampering |
| Cookie security | `httpOnly`, `sameSite: lax` | Prevents XSS token theft |
| Rate limiting | Per-IP, per-endpoint, fixed window | Prevents abuse and quota exhaustion |
| Input sanitization | DOMPurify for comment HTML | Prevents XSS in user-generated content |

---

## Build & Deployment

**Build toolchain:**
- **Vite** — Dev server and production bundler
- **SvelteKit** — Framework with file-based routing and SSR
- **Node adapter** — Deploys as a standard Node.js server

**Build-time plugins:**
- `serviceWorkerVersion` (in `vite.config.ts`) — Auto-updates `APP_VERSION` in `sw.js` and generates `asset-manifest.json` for precaching

**Key configuration files:**
- `svelte.config.js` — SvelteKit adapter and preprocessor config
- `vite.config.ts` — Vite plugins, chunk splitting, build targets
- `knip.config.ts` — Unused export/dependency detection
- `eslint.config.js` — Linting rules (TypeScript + Svelte)
