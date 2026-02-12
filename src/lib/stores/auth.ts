/**
 * Authentication Store
 *
 * Manages the user's authentication state (signed-in status and profile data)
 * using two Svelte writable stores:
 *
 *   - `authState`   -- holds the current {@link AuthState} (sign-in flag + user profile).
 *   - `authLoading` -- a boolean flag that is `true` while the initial auth check is
 *                      in progress, allowing the UI to show a loading indicator.
 *
 * Authentication is driven entirely by the server: `checkAuth` calls `/api/auth/me`
 * and `signOut` calls `/api/auth/logout`. There is no client-side token management;
 * the server handles sessions/cookies.
 *
 * Reactive pattern: Svelte `writable` stores. Components subscribe via `$authState`
 * and `$authLoading` to reactively reflect login status across the app.
 */
import { writable } from 'svelte/store';
import type { AuthState } from '$lib/types';

/**
 * Svelte writable store representing the current authentication state.
 *
 * Defaults to a signed-out state (`isSignedIn: false, user: null`) until
 * {@link checkAuth} resolves with the server's response.
 */
export const authState = writable<AuthState>({
	isSignedIn: false,
	user: null
});

/**
 * Svelte writable store indicating whether the initial authentication check is
 * still in flight. Starts as `true` and is set to `false` once {@link checkAuth}
 * completes (regardless of success or failure).
 *
 * Useful for gating UI elements that depend on knowing the auth state -- e.g.
 * showing a spinner instead of a "Sign In" button while the check runs.
 */
export const authLoading = writable(true);

/**
 * Fetches the current user's authentication status from the server.
 *
 * On success, updates {@link authState} with the server-provided `AuthState`
 * (which includes `isSignedIn` and the `UserProfile`). On failure (network
 * error or non-OK response), the store retains its default signed-out state.
 *
 * Always sets {@link authLoading} to `false` when finished so the UI can
 * transition out of its loading state.
 *
 * @returns A promise that resolves when the auth check is complete.
 */
export async function checkAuth(): Promise<void> {
	try {
		const res = await fetch('/api/auth/me');
		if (res.ok) {
			const data = await res.json();
			authState.set(data);
		}
		// Non-OK responses (401, 403, etc.) are intentionally ignored --
		// the store stays in its default signed-out state.
	} catch {
		// Network errors are silently swallowed; the user is treated as not signed in.
	} finally {
		// Signal that the initial auth check is done, regardless of outcome.
		authLoading.set(false);
	}
}

/**
 * Signs the user out by calling the server logout endpoint and resetting local state.
 *
 * If the server request fails (e.g. network issue), the local auth state is still
 * reset to signed-out so the UI remains consistent and the user is not stuck in a
 * "logged in" state they cannot escape.
 *
 * @returns A promise that resolves when sign-out handling is complete.
 */
export async function signOut(): Promise<void> {
	try {
		await fetch('/api/auth/logout', { method: 'POST' });
		authState.set({ isSignedIn: false, user: null });
	} catch {
		// Even if the server call fails, force a local sign-out so the UI
		// does not remain in an inconsistent authenticated state.
		authState.set({ isSignedIn: false, user: null });
	}
}
