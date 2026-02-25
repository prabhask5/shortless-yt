# Shortless YouTube

**Completely erase YouTube Shorts from existence.** No shelves, no tabs, no sidebar links, no filter chips, no notifications, no recommendations, no remixes, no trace. YouTube the way it should be — just videos.

Available as a **Chrome/Firefox browser extension** and an **iOS Safari userscript** (which lets you replace the YouTube app on your phone entirely).

## Install

### Chrome Web Store

> [Install from Chrome Web Store](https://chrome.google.com/webstore/detail/shortless-youtube/PLACEHOLDER) *(coming soon)*

### Firefox Add-ons

> [Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/shortless-youtube/) *(coming soon)*

### Manual Install (Chrome)

If you want to install from source (or the extension isn't on the store yet):

**Prerequisites:** [Node.js](https://nodejs.org/) 18+ installed on your computer, and [Git](https://git-scm.com/) to clone the repo.

1. Clone this repo and build:
   ```bash
   git clone https://github.com/YOUR_USERNAME/shortless-yt.git
   cd shortless-yt
   npm run build:chrome
   ```
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer Mode** (toggle in the top-right corner)
4. Click **"Load unpacked"**
5. Select the `dist-chrome/` folder inside the cloned repo
6. Navigate to [youtube.com](https://www.youtube.com) — Shorts are gone

The extension persists across browser restarts. To update, `git pull` and re-run `npm run build:chrome`, then click the reload button on the extension card in `chrome://extensions`.

### Manual Install (Firefox)

**Prerequisites:** Same as Chrome — [Node.js](https://nodejs.org/) 18+ and [Git](https://git-scm.com/).

1. Clone this repo and build:
   ```bash
   git clone https://github.com/YOUR_USERNAME/shortless-yt.git
   cd shortless-yt
   npm run build:firefox
   ```
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click **"Load Temporary Add-on..."**
4. Navigate into the `dist-firefox/` folder and select `manifest.json`
5. Navigate to [youtube.com](https://www.youtube.com) — Shorts are gone

**Note:** Firefox temporary add-ons are removed when the browser closes. For a permanent install, package the extension (`npm run package`) and submit the generated `shortless-youtube-firefox.zip` to [Firefox Add-ons](https://addons.mozilla.org/) for signing, or use [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) for development.

---

## iOS Safari Setup (Replace the YouTube App)

This section walks you through replacing the YouTube app on your iPhone or iPad with a Shorts-free version that lives on your home screen and looks just like a native app.

### What You Need

- **iPhone or iPad** running **iOS 15.1** or later (to check: Settings --> General --> About --> iOS Version)
- **Safari** (the built-in browser — this does not work with Chrome or Firefox on iOS)
- **A computer** to download the userscript file (or you can download it directly on your phone via Safari)

### Step 1: Install the Userscripts App

[Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) is a free, open-source Safari extension that lets you run custom JavaScript on any website. It's the only dependency you need.

1. Open the **App Store** on your iPhone/iPad
2. Search for **"Userscripts"** (by Justin Wasack) — it has a `</>` icon
3. Tap **Get** to install it (it's free, no in-app purchases)

### Step 2: Enable the Userscripts Extension in Safari

iOS requires you to manually enable Safari extensions after installing them:

1. Open the **Settings** app
2. Scroll down and tap **Safari**
3. Tap **Extensions**
4. Tap **Userscripts**
5. Toggle **Allow Extension** to ON
6. Under "Permissions", set **All Websites** to **Allow** (the userscript needs to run on youtube.com)

### Step 3: Set Up a Script Directory

The Userscripts app stores scripts in a folder you choose. It can be anywhere in Files — iCloud Drive, On My iPhone, or a local folder.

1. Open the **Userscripts** app (the one you just installed — find it on your home screen)
2. Tap **"Set Userscripts Directory"**
3. Choose a location — **iCloud Drive** is recommended (it syncs across devices), but "On My iPhone" works fine too
4. If prompted, tap **Open** to grant access

### Step 4: Add the Shortless YouTube Userscript

You need to get the file `userscript/shortless-youtube.user.js` from this repo into the directory you chose in Step 3.

**Option A — Download directly on your phone:**
1. Open Safari on your iPhone/iPad
2. Navigate to this repo's `userscript/shortless-youtube.user.js` file on GitHub
3. Tap the **Raw** button to view the raw file
4. Long-press the page --> **"Download Linked File"** (or tap Share --> **"Save to Files"**)
5. Save it to the same folder you selected as your Userscripts directory in Step 3

**Option B — Transfer from your computer:**
1. On your computer, download `userscript/shortless-youtube.user.js` from this repo
2. AirDrop it to your phone, or save it to iCloud Drive
3. Use the **Files** app on your phone to move it into your Userscripts directory if needed

### Step 5: Verify It Works

1. Open **Safari** on your iPhone/iPad
2. Navigate to [youtube.com](https://www.youtube.com)
3. You should see YouTube load normally — but with zero Shorts anywhere
4. Check: no "Shorts" in the bottom navigation bar, no Shorts shelves on the home page, no Shorts in search results
5. If you see a puzzle-piece icon in Safari's address bar, tap it and make sure Userscripts shows a green checkmark for this page

### Step 6: Add YouTube to Your Home Screen

**Important:** Do NOT use Safari's "Add to Home Screen" — that creates a standalone web app (PWA) that runs outside of Safari, which means extensions (including this userscript) will not work. Instead, use the **Shortcuts** app to create a home screen icon that opens YouTube inside Safari where the extension is active:

1. Open the **Shortcuts** app (built into iOS — if you deleted it, re-download it from the App Store)
2. Tap the **+** button in the top-right corner to create a new shortcut
3. Tap **Add Action**
4. Search for **"Open URLs"** and select it
5. Tap the blue **"URL"** placeholder text and type: `https://www.youtube.com`
6. Tap the shortcut name at the top of the screen (it will say something like "Open URLs") --> tap **Rename** --> type **"YouTube"**
7. Tap the icon next to the name --> choose a color and glyph that looks like YouTube (red background + play triangle), or tap **"Choose Photo"** to use a YouTube logo you've saved
8. Tap the **share button** at the bottom of the screen (square with arrow pointing up)
9. Tap **"Add to Home Screen"**
10. Verify the name is **"YouTube"** and tap **Add**

You now have a home screen icon that opens YouTube directly inside Safari — with the Shortless YouTube userscript running automatically.

### Step 7: Remove the YouTube App (Optional but Recommended)

If you keep the YouTube app installed, iOS will try to open YouTube links in the app instead of Safari. To prevent this:

1. Long-press the **YouTube** app icon on your home screen
2. Tap **"Remove App"** --> **"Delete App"**
   - Or if you want to keep the app data: tap **"Remove from Home Screen"** instead, then go to Settings --> General --> iPhone Storage --> YouTube --> **"Offload App"**
3. Your new Shortcuts-based "YouTube" icon replaces it on the home screen

**Why delete the app?** Even if you have the home screen shortcut, iOS will intercept YouTube links (from Messages, Mail, other apps) and open them in the YouTube app instead of Safari. Removing the app ensures all YouTube links open in Safari where the userscript is active.

**Result:** You now have a home screen icon that opens a completely Shorts-free YouTube. It opens inside Safari (not as a standalone web app), so the Userscripts extension injects the Shortless YouTube script automatically. No YouTube app needed.

---

## Everything That Gets Blocked

This extension is designed to be **exhaustive**. If Shorts appear anywhere on YouTube, they get removed. Here is every location:

| Location | What's Removed | How |
| --- | --- | --- |
| **Home page** | Shorts shelves, carousels, and individual Shorts in the main feed | CSS + JS |
| **Search results** | Shorts filter chip, Shorts shelf, individual Shorts mixed into results | CSS + JS |
| **Subscriptions** | Shorts shelves and individual Shorts in the subscription feed | CSS + JS |
| **Channel pages** | "Shorts" tab in the channel tab strip | CSS + JS |
| **Sidebar (expanded)** | "Shorts" link in the full left sidebar navigation | CSS + JS |
| **Sidebar (collapsed)** | "Shorts" icon in the mini sidebar | CSS + JS |
| **Watch page sidebar** | Shorts recommended in the "Up next" panel | JS |
| **Watch page** | "Shorts remixing this video" shelf below the player | CSS |
| **Notifications** | Bell dropdown entries that link to Shorts | CSS + JS |
| **Explore / Trending** | Shorts mixed into trending content | CSS |
| **Direct `/shorts/` URLs** | Redirected to normal `/watch?v=` player before the page loads | Network redirect (extension) / History API (userscript) |
| **SPA navigations** | In-app navigations to `/shorts/` intercepted and rewritten | JS (history.pushState/replaceState monkey-patching) |
| **Mobile home feed** | Shorts shelves and Shorts cards on `m.youtube.com` | CSS + JS (userscript) |
| **Mobile navigation** | "Shorts" tab in the bottom navigation bar on mobile | CSS + JS (userscript) |
| **Mobile search/browse** | Shorts lockups and Shorts-styled video cards | CSS (userscript) |

**CSS** = instant hiding at `document_start`, no flash of content.
**JS** = MutationObserver cleanup for dynamically loaded elements.
**Network redirect** = Declarative Net Request (catches requests before the page even starts loading).

## How It Works

1. **CSS injection at `document_start`** — The browser injects `shortless.css` before YouTube renders anything. Every known Shorts element is set to `display: none !important`. This is why you never see a flash of Shorts content.

2. **URL redirect at the network level** — The extension's `rules.json` uses Chrome/Firefox's Declarative Net Request API to redirect any `youtube.com/shorts/VIDEO_ID` request to `youtube.com/watch?v=VIDEO_ID` before the page even loads. The userscript achieves the same thing by monkey-patching `history.pushState` and `history.replaceState`.

3. **MutationObserver cleanup** — YouTube lazily loads content as you scroll and navigate. The content script watches the entire DOM for changes and removes any Shorts elements that appear, debounced to 150ms batches for performance.

4. **SPA navigation interception** — YouTube is a single-page app. The script listens for YouTube's custom `yt-navigate-start` and `yt-navigate-finish` events to catch navigations to Shorts pages and re-scan for Shorts elements after each page transition.

## Building & Packaging

**Prerequisites:** [Node.js](https://nodejs.org/) 18+

```bash
npm run build            # Build for both Chrome and Firefox
npm run build:chrome     # Build for Chrome only
npm run build:firefox    # Build for Firefox only
npm run package          # Build + create zip files for both browsers
npm run release          # Bump version, build, and package
npm run clean            # Remove dist-chrome/ and dist-firefox/
```

The build script copies source files from `src/` and the correct manifest from `manifests/` into `dist-chrome/` or `dist-firefox/`. No bundler, no transpiler — it's plain JavaScript.

### Releasing a New Version

```bash
npm run release              # Bump patch: 1.0.0 -> 1.0.1
npm run release -- minor     # Bump minor: 1.0.0 -> 1.1.0
npm run release -- major     # Bump major: 1.0.0 -> 2.0.0
npm run release -- 1.2.3     # Set explicit version
```

This updates the version in `package.json`, both manifests (`manifests/chrome.json`, `manifests/firefox.json`), and the userscript header, then builds and packages zip files ready for upload to the Chrome Web Store and Firefox Add-ons.

## Project Structure

```
shortless-yt/
├── icons/                         # Extension icons
│   ├── icon.svg                   # Source SVG (YouTube play button + "no Shorts" sign)
│   ├── icon-16.png                # Generated from SVG
│   ├── icon-32.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── generate-pngs.html        # Browser-based PNG export tool (backup)
├── src/                           # Extension source (shared between Chrome/Firefox)
│   ├── shortless.css              # CSS rules that instantly hide all Shorts elements
│   ├── shortless.js               # Content script (redirect + MutationObserver + SPA handling)
│   ├── background.js              # Service worker (minimal lifecycle logging)
│   └── rules.json                 # Declarative Net Request redirect rule
├── manifests/                     # Browser-specific Manifest V3 files
│   ├── chrome.json                # Chrome: service_worker, minimum_chrome_version
│   └── firefox.json               # Firefox: scripts array, gecko settings
├── userscript/
│   └── shortless-youtube.user.js  # Self-contained userscript (CSS + JS, desktop + mobile)
├── build.js                       # Build script: copies src + icons + manifest -> dist-*
├── release.js                     # Version bump + build + package
├── package.json                   # npm scripts: build, package, release, clean
└── .gitignore
```

## License

MIT
