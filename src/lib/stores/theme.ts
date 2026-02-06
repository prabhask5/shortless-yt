import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
	if (!browser) return 'dark';
	const stored = localStorage.getItem('theme');
	if (stored === 'light' || stored === 'dark') return stored;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const theme = writable<Theme>(getInitialTheme());

export function toggleTheme(): void {
	theme.update((t) => {
		const next = t === 'dark' ? 'light' : 'dark';
		if (browser) {
			localStorage.setItem('theme', next);
			document.documentElement.setAttribute('data-theme', next);
		}
		return next;
	});
}

export function initTheme(): void {
	if (!browser) return;
	const t = getInitialTheme();
	document.documentElement.setAttribute('data-theme', t);
	theme.set(t);
}
