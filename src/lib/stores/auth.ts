/**
 * @fileoverview Client-side authentication state store.
 *
 * Provides a Svelte writable store that tracks the current user's
 * authentication status. The store starts in a loading state (`isLoading: true`)
 * because the initial auth check requires a round-trip to the server (via the
 * layout load function) to verify the session cookie. Once the layout resolves,
 * components update the store with the user's profile or set it to `null` for
 * unauthenticated visitors.
 *
 * This store is consumed by the navigation bar (to show avatar/sign-in button)
 * and by any component that gates functionality behind authentication.
 */

import { writable } from 'svelte/store';

/** Shape of the client-side authentication state. */
interface AuthState {
	/** The authenticated user's basic profile info, or `null` if signed out. */
	user: { avatarUrl: string; channelTitle: string } | null;
	/** `true` while the initial session check is in progress. */
	isLoading: boolean;
}

/**
 * Reactive store for the current authentication state.
 *
 * Initialized with `isLoading: true` so that UI can show a loading indicator
 * until the session has been validated server-side.
 */
export const authState = writable<AuthState>({ user: null, isLoading: true });
