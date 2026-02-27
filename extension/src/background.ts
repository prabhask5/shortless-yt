/**
 * @file background.ts — Service worker for the Shortless YouTube extension.
 *
 * This is intentionally minimal. All heavy lifting is done by:
 *   - shortless.ts (content script) — DOM cleanup and SPA navigation interception
 *   - shortless.css (content styles) — CSS-based hiding of Shorts elements
 *   - rules.json (declarativeNetRequest) — network-level URL redirects
 *
 * The service worker exists solely to log lifecycle events for debugging.
 */

/**
 * Fired when the extension is first installed or updated to a new version.
 * Logs the event reason so developers can verify the extension loaded correctly
 * in chrome://extensions or the DevTools service worker console.
 */
chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason === 'install') {
		console.log('[Shortless YT] Extension installed successfully.');
	} else if (details.reason === 'update') {
		console.log(
			'[Shortless YT] Extension updated to version',
			chrome.runtime.getManifest().version
		);
	}
});
