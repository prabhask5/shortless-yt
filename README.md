# Shortless YouTube

**YouTube without Shorts.** Two tools, one mission: completely erase YouTube Shorts from your experience.

## Projects

### [PWA App](/) (root)

A standalone YouTube frontend that never shows Shorts by design. Built with SvelteKit, it proxies the YouTube Data API and filters out all short-form content server-side. Install it as a PWA on your phone to replace the YouTube app entirely.

- Search, watch, browse channels and playlists — all Shorts-free
- Google OAuth for subscriptions and liked videos
- Works on any device as an installable PWA

### [Browser Extension](extension/)

A Chrome/Firefox extension that removes all traces of Shorts from youtube.com. CSS injection, DOM cleanup, URL redirects — the full arsenal.

- Zero Shorts on the home page, search, subscriptions, channels, sidebar, notifications
- `/shorts/` URLs redirected to normal `/watch?v=` player
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
