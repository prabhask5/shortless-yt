# Shortless

A YouTube web client built with SvelteKit that removes Shorts from all content surfaces. Search, watch, and browse YouTube without any Shorts appearing in your results.

## Features

- **Search videos** with automatic Shorts filtering and backfill
- **Watch videos** using YouTube's official IFrame Player API
- **View comments** with top/newest sorting and threaded replies
- **No Shorts** - automatically detected and filtered everywhere
- **Google Sign-In** via OAuth 2.0 with PKCE for potential Premium ad-free playback
- **Light/Dark theme** with YouTube-like styling
- **PWA support** - installable on iPhone and other devices
- **Responsive** - works on desktop and mobile (optimized for iPhone 16 Pro)

## Setup

### Prerequisites

- Node.js 22+ (use `nvm use` to auto-select)
- A YouTube Data API v3 key

### 1. Get a YouTube API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Enable the **YouTube Data API v3**
4. Create an **API Key** credential
5. (Optional) Restrict the key to YouTube Data API v3

### 2. (Optional) Set Up Google OAuth

If you want sign-in functionality:

1. In Google Cloud Console, go to **APIs & Services > Credentials**
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorized redirect URI: `http://localhost:5173/api/auth/callback`
4. Note the Client ID and Client Secret

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```
YT_API_KEY=your_youtube_api_key_here
GOOGLE_CLIENT_ID=your_client_id        # optional
GOOGLE_CLIENT_SECRET=your_secret       # optional
OAUTH_REDIRECT_URI=http://localhost:5173/api/auth/callback
```

### 4. Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## API Quota Considerations

The YouTube Data API v3 has a daily quota (typically 10,000 units/day for free tier):

| Operation           | Cost      | Notes                                     |
| ------------------- | --------- | ----------------------------------------- |
| search.list         | 100 units | Most expensive; used for search + related |
| videos.list         | 1 unit    | Used to hydrate video details             |
| commentThreads.list | 1 unit    | Comments with pagination                  |
| comments.list       | 1 unit    | Comment replies                           |

**Quota optimization built-in:**

- Server-side caching with configurable TTLs
- Individual video caching (12h TTL) avoids redundant hydration
- Search results cached for 10 minutes
- Rate limiting per IP on all endpoints

**To reduce usage:**

- Avoid excessive searching
- Results and video data are cached server-side
- Related videos use search (which costs 100 units each)

## Shorts Detection

Since there's no official `isShort` field in the YouTube API, Shortless uses a layered heuristic:

1. **Duration check**: Videos <= 60 seconds are treated as Shorts
2. **Keyword matching**: Title, description, or tags containing `#shorts`, `shorts`, `ytshorts`
3. **Backfill**: When too many results are filtered, additional pages are fetched automatically

### Tuning the Shorts Threshold

In **Settings**, you can change the max duration threshold:

- **60s** (default) - standard YouTube Shorts length
- **90s** - catches longer Shorts
- **120s** - aggressive filtering

The threshold is stored in your browser's localStorage.

To change the default server-side, edit `src/lib/server/shorts-filter.ts`:

```typescript
const DEFAULT_CONFIG: ShortsConfig = {
	maxDurationSeconds: 60, // Change this value
	keywords: ['#shorts', 'shorts', 'ytshorts', '#short']
};
```

## Cache TTLs

Server-side cache durations can be tuned in `src/lib/server/cache.ts`:

```typescript
const DEFAULT_TTLS = {
	search: 10 * 60 * 1000, // 10 minutes
	video: 12 * 60 * 60 * 1000, // 12 hours
	comments: 5 * 60 * 1000, // 5 minutes
	related: 10 * 60 * 1000, // 10 minutes
	shortCheck: 7 * 24 * 60 * 60 * 1000 // 7 days
};
```

## YouTube Premium & Ads

**Important limitations:**

- This app uses YouTube's **official IFrame Player API** for all playback
- **Ad behavior is controlled entirely by YouTube** - we cannot block, skip, or modify ads
- If you have YouTube Premium:
  - Sign into Google in this browser AND in the app
  - Allow third-party cookies for `youtube.com` and `google.com`
  - Premium ad-free playback depends on YouTube recognizing your session in the embedded player
  - Some browsers block cross-site cookies, which prevents Premium from applying
  - If ads still appear, use the "Open on YouTube" button on the watch page

**We cannot:**

- Detect whether you have Premium
- Guarantee ad-free playback
- Block or skip ads
- Bypass any YouTube restrictions

## Installing as a PWA

### iPhone (iOS Safari)

1. Open the app in **Safari** (not Chrome or other browsers)
2. Tap the **Share** button (square with arrow) at the bottom of Safari
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"** in the top right
5. The app will appear on your home screen and run in standalone mode

### Android (Chrome)

1. Open the app in Chrome
2. Tap the three-dot menu
3. Tap **"Install app"** or **"Add to Home Screen"**

### Desktop (Chrome/Edge)

1. Look for the install icon in the address bar
2. Click **"Install"**

### Offline Behavior

- The app shell (pages, CSS, JS) loads offline
- Previously viewed search results and video metadata are cached
- **Video playback requires an internet connection** (YouTube embeds cannot work offline)
- An offline banner appears when connectivity is lost

## Project Structure

```
src/
├── app.css                    # Global styles, CSS variables, theme
├── app.html                   # HTML template with PWA meta tags
├── lib/
│   ├── types.ts               # TypeScript interfaces
│   ├── components/            # Svelte UI components
│   │   ├── TopBar.svelte      # Header with search and auth
│   │   ├── SideNav.svelte     # Desktop side navigation
│   │   ├── BottomNav.svelte   # Mobile bottom navigation
│   │   ├── SearchBox.svelte   # Search input with history
│   │   ├── VideoCard.svelte   # Video thumbnail card
│   │   ├── VideoGrid.svelte   # Grid/list of videos
│   │   ├── WatchPlayer.svelte # YouTube IFrame player wrapper
│   │   ├── VideoMeta.svelte   # Video title, channel, stats
│   │   ├── Description.svelte # Collapsible description
│   │   ├── RelatedList.svelte # Related videos sidebar
│   │   ├── CommentList.svelte # Comments section
│   │   ├── CommentItem.svelte # Individual comment thread
│   │   ├── ErrorBanner.svelte # Error messages
│   │   ├── LoadingSkeletons.svelte # Loading placeholders
│   │   ├── PremiumHelpModal.svelte # Premium troubleshooting
│   │   ├── ShortsBlockPage.svelte  # Shorts blocked message
│   │   ├── OfflineBanner.svelte    # Offline indicator
│   │   └── InstallBanner.svelte    # iOS install prompt
│   ├── stores/                # Svelte stores
│   │   ├── auth.ts            # Auth state management
│   │   ├── theme.ts           # Light/dark theme
│   │   └── search-history.ts  # Search history (localStorage)
│   ├── utils/
│   │   └── format.ts          # View count, duration, time formatters
│   └── server/                # Server-only modules
│       ├── youtube-api.ts     # YouTube Data API client
│       ├── cache.ts           # In-memory cache with TTL/SWR
│       ├── shorts-filter.ts   # Shorts detection heuristics
│       ├── rate-limiter.ts    # Per-IP rate limiting
│       ├── auth.ts            # OAuth + session management
│       └── logger.ts          # Structured logging
├── routes/
│   ├── +layout.svelte         # App shell layout
│   ├── +page.svelte           # Home page
│   ├── results/+page.svelte   # Search results
│   ├── watch/[id]/+page.svelte # Video watch page
│   ├── settings/+page.svelte  # Settings page
│   └── api/                   # Server API endpoints
│       ├── search/+server.ts
│       ├── videos/+server.ts
│       ├── related/+server.ts
│       ├── comments/+server.ts
│       └── auth/
│           ├── login/+server.ts
│           ├── callback/+server.ts
│           ├── logout/+server.ts
│           └── me/+server.ts
└── static/
    ├── favicon.svg
    ├── manifest.webmanifest
    ├── sw.js                  # Service worker
    └── icons/                 # PWA icons (SVG)
```

## Development

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # Type checking
npm run lint         # ESLint
npm run format       # Prettier format
npm run format:check # Prettier check
npm run knip         # Find unused exports/dependencies
npm run validate     # Run all checks (lint + format:check + check + knip + build)
npm run cleanup      # Auto-fix (format + lint:fix)
```

## Security

- YouTube API key is **server-side only** (never exposed to the browser)
- OAuth uses **Authorization Code Flow with PKCE**
- CSRF protection via state parameter validation
- Session tokens in **httpOnly cookies**
- Rate limiting on all API endpoints
- Comment text is sanitized before rendering

## License

MIT
