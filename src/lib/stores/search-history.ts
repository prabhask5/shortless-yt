/**
 * Search History Store
 *
 * Manages a persistent list of recent search queries using a Svelte writable store
 * backed by localStorage. The store is initialized by reading from localStorage on
 * the client side, and every mutation (add/clear) is synced back to localStorage so
 * history survives page reloads and browser restarts.
 *
 * Reactive pattern: Svelte `writable` store. Components subscribe via `$searchHistory`
 * and receive automatic updates whenever `addSearch` or `clearHistory` is called.
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/** Maximum number of search queries retained in history. Oldest entries are dropped first. */
const MAX_HISTORY = 20;

/** localStorage key under which the search history array is persisted as JSON. */
const STORAGE_KEY = 'search_history';

/**
 * Loads the persisted search history from localStorage.
 *
 * @returns The stored history array, or an empty array if running on the server,
 *          if nothing is stored, or if the stored value is malformed JSON.
 */
function load(): string[] {
	// On the server there is no localStorage, so return an empty placeholder.
	if (!browser) return [];
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		// Gracefully handle corrupt or unreadable localStorage data.
		return [];
	}
}

/**
 * Svelte writable store holding the current search history as an array of query strings.
 * The most recent search is always at index 0.
 *
 * Initialized eagerly from localStorage via `load()` so the UI has data on first render.
 */
export const searchHistory = writable<string[]>(load());

/**
 * Adds a search query to the top of the history list.
 *
 * - Blank/whitespace-only queries are ignored.
 * - Duplicate entries are removed so the same query appears only once (at the top).
 * - The list is capped at {@link MAX_HISTORY} entries.
 * - The updated list is persisted to localStorage on the client.
 *
 * @param query - The search query string to add.
 * @returns void
 */
export function addSearch(query: string): void {
	if (!query.trim()) return;
	searchHistory.update((history) => {
		// Remove any existing occurrence of the same query to avoid duplicates.
		const filtered = history.filter((h) => h !== query);
		// Prepend the new query and cap at MAX_HISTORY entries.
		const updated = [query, ...filtered].slice(0, MAX_HISTORY);
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
		}
		return updated;
	});
}

/**
 * Clears the entire search history, both in the reactive store and in localStorage.
 *
 * @returns void
 */
export function clearHistory(): void {
	searchHistory.set([]);
	if (browser) {
		localStorage.removeItem(STORAGE_KEY);
	}
}
