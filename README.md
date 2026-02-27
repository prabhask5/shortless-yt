# Shortless YouTube

**YouTube without Shorts.** Two tools, one mission: completely erase YouTube Shorts from your experience.

Check it out at: [youtube.prabhas.io](https://youtube.prabhas.io)

## Projects

### [PWA App](/) (root)

A standalone YouTube frontend that never shows Shorts by design. Built with SvelteKit, it proxies the YouTube Data API and filters out all short-form content server-side. Install it as a PWA on your phone to replace the YouTube app entirely.

#### What you get

- Trending videos, search, channels, playlists — all completely Shorts-free
- Google OAuth sign-in for your subscriptions feed and liked videos
- Dark mode that follows your system preference
- Installable as a PWA on iOS, Android, and desktop
- Channel pages with banner, profile, video grid, and sort options
- Video player with chapters, comments, and channel uploads sidebar
- YouTube-style loading skeletons for instant page transitions

#### Limitations compared to the YouTube app

- **YouTube Data API daily quota**: Google limits API usage to 10,000 units per day across all users. Under heavy usage, the app may hit this limit and show a "Daily Limit Reached" message until the quota resets at midnight Pacific Time. The official YouTube app has no such limit.
- **No notifications**: There are no push notifications for new uploads from subscribed channels.
- **No watch history or recommendations**: The app does not track what you watch, so there is no personalized home feed or "recommended for you" suggestions. Signed-out users see trending videos instead.
- **No live chat or premieres**: Live streams play but live chat is not available.
- **No community posts or stories**: Only videos are shown on channel pages.
- **No casting**: Chromecast and AirPlay are not supported.
- **No offline downloads**: Videos cannot be saved for offline viewing.
- **No picture-in-picture on iOS**: PiP depends on browser support and may not work in the PWA shell on all devices.
- **No ad-free playback**: Videos are embedded via YouTube's standard player, so ads play as normal. The app does not block or skip ads.

#### Why use it anyway

The app exists for one reason: a clean YouTube experience without Shorts. If you find Shorts distracting and want a focused way to browse long-form content — tutorials, podcasts, music, documentaries — this gives you that without needing to fight the algorithm. It works as a home screen app on your phone and feels native.

### [Browser Extension](extension/)

A Chrome/Firefox extension that removes all traces of Shorts from youtube.com. CSS injection, DOM cleanup, URL redirects — the full arsenal.

- Zero Shorts on the home page, search, subscriptions, channels, sidebar, notifications
- `/shorts/` URLs redirected to normal `/watch?v=` player
- No data collection, no external requests
- Works on desktop browsers

## Development

### PWA App

```bash
npm install
npm run dev              # Start dev server
npm run build            # Production build
npm run validate         # Type check + lint + dead code detection
npm run cleanup          # Format all files
```

### Browser Extension

```bash
cd extension
npm install
npm run build            # Build for Chrome + Firefox
```

## License

MIT
