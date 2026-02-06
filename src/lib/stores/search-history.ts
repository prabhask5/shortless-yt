import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const MAX_HISTORY = 20;
const STORAGE_KEY = 'search_history';

function load(): string[] {
	if (!browser) return [];
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
}

export const searchHistory = writable<string[]>(load());

export function addSearch(query: string): void {
	if (!query.trim()) return;
	searchHistory.update((history) => {
		const filtered = history.filter((h) => h !== query);
		const updated = [query, ...filtered].slice(0, MAX_HISTORY);
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
		}
		return updated;
	});
}

export function clearHistory(): void {
	searchHistory.set([]);
	if (browser) {
		localStorage.removeItem(STORAGE_KEY);
	}
}
