import { writable } from 'svelte/store';
import type { AuthState } from '$lib/types';

export const authState = writable<AuthState>({
	isSignedIn: false,
	user: null
});

export const authLoading = writable(true);

export async function checkAuth(): Promise<void> {
	try {
		const res = await fetch('/api/auth/me');
		if (res.ok) {
			const data = await res.json();
			authState.set(data);
		}
	} catch {
		// Silently fail - user is not signed in
	} finally {
		authLoading.set(false);
	}
}

export async function signOut(): Promise<void> {
	try {
		await fetch('/api/auth/logout', { method: 'POST' });
		authState.set({ isSignedIn: false, user: null });
	} catch {
		// Force local sign out
		authState.set({ isSignedIn: false, user: null });
	}
}
