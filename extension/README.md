# Shortless YouTube — Browser Extension

**Completely erase YouTube Shorts from existence.** No shelves, no tabs, no sidebar links, no filter chips, no notifications, no recommendations, no remixes, no trace. YouTube the way it should be — just videos.

## Install

| Browser | Link                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| Chrome  | [Chrome Web Store](https://chromewebstore.google.com/detail/shortless-youtube/gbhekjekjjjepnnbbfipfbiobndblpaa) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/shortless-youtube/)                            |

---

### Manual Install (Chrome)

**Prerequisites:** [Node.js](https://nodejs.org/) 18+

```bash
git clone https://github.com/YOUR_USERNAME/shortless-yt.git
cd shortless-yt/extension
npm install
npm run build:chrome
```

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode**
3. Click **"Load unpacked"** → select `dist-chrome/`
4. Navigate to [youtube.com](https://www.youtube.com) — Shorts are gone

### Manual Install (Firefox)

```bash
git clone https://github.com/YOUR_USERNAME/shortless-yt.git
cd shortless-yt/extension
npm install
npm run build:firefox
```

1. Open Firefox → `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on..."** → select `dist-firefox/manifest.json`

## Everything That Gets Blocked

| Location                   | What's Removed                                       | How              |
| -------------------------- | ---------------------------------------------------- | ---------------- |
| **Home page**              | Shorts shelves, carousels, and individual Shorts     | CSS + JS         |
| **Search results**         | Shorts filter chip, Shorts shelf, individual Shorts  | CSS + JS         |
| **Subscriptions**          | Shorts shelves and individual Shorts                 | CSS + JS         |
| **Channel pages**          | "Shorts" tab in the channel tab strip                | CSS + JS         |
| **Sidebar**                | "Shorts" link in both expanded and collapsed sidebar | CSS + JS         |
| **Watch page sidebar**     | Shorts in "Up next" panel                            | JS               |
| **Watch page**             | "Shorts remixing this video" shelf                   | CSS              |
| **Notifications**          | Entries linking to Shorts                            | CSS + JS         |
| **Explore / Trending**     | Shorts in trending content                           | CSS              |
| **Direct `/shorts/` URLs** | Redirected to `/watch?v=` before page loads          | Network redirect |
| **SPA navigations**        | In-app navigations to `/shorts/` intercepted         | JS               |

## How It Works

1. **CSS injection at `document_start`** — hides all known Shorts elements before YouTube renders
2. **URL redirect at the network level** — Declarative Net Request redirects `/shorts/VIDEO_ID` to `/watch?v=VIDEO_ID`
3. **MutationObserver cleanup** — watches the DOM for dynamically loaded Shorts elements (debounced 150ms)
4. **SPA navigation interception** — listens for YouTube's custom events + monkey-patches history API

## Building & Packaging

```bash
npm run build            # Build for both Chrome and Firefox
npm run build:chrome     # Build for Chrome only
npm run build:firefox    # Build for Firefox only
npm run package          # Build + create zip files
npm run release          # Bump version, build, and package
npm run clean            # Remove build artifacts
```

## Project Structure

```
extension/
├── src/
│   ├── shortless.ts       # Content script (redirect + MutationObserver + SPA handling)
│   ├── shortless.css      # CSS rules that hide all Shorts elements
│   ├── background.ts      # Service worker (minimal lifecycle logging)
│   └── rules.json         # Declarative Net Request redirect rule
├── manifests/
│   ├── chrome.json        # Chrome Manifest V3
│   └── firefox.json       # Firefox Manifest V3
├── icons/                 # Extension icons (16/32/48/128px PNGs + source SVG)
├── build.js               # Build script
├── release.js             # Version bump + build + package
└── package.json
```

## License

MIT
