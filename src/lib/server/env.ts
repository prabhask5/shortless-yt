/**
 * @fileoverview Typed environment variable access for server-side code.
 *
 * Wraps SvelteKit's `$env/dynamic/private` with runtime validation so that
 * missing variables fail fast at startup rather than producing cryptic errors
 * deep in business logic. Each exported constant is a lazy thunk (a zero-arg
 * function) so that the environment is only read when the value is actually
 * needed -- this avoids import-time crashes during build/prerender steps where
 * env vars may not yet be populated.
 */

import { env } from '$env/dynamic/private';

/**
 * Retrieve a required environment variable by key.
 *
 * @param key - The environment variable name to look up.
 * @returns The string value of the environment variable.
 * @throws {Error} If the variable is missing or empty.
 */
export function getEnv(key: string): string {
	const value = env[key];
	if (!value) throw new Error(`Missing environment variable: ${key}`);
	return value;
}

// ===================================================================
// Lazy env accessors — called as functions so reads are deferred
// ===================================================================

/** YouTube Data API v3 key for unauthenticated public requests. */
export const YOUTUBE_API_KEY = () => getEnv('YOUTUBE_API_KEY');

/** Google OAuth2 client ID for the consent screen. */
export const GOOGLE_CLIENT_ID = () => getEnv('GOOGLE_CLIENT_ID');

/** Google OAuth2 client secret used during the token exchange. */
export const GOOGLE_CLIENT_SECRET = () => getEnv('GOOGLE_CLIENT_SECRET');

/** HMAC secret used to sign and verify session cookies. */
export const AUTH_SECRET = () => getEnv('AUTH_SECRET');

/** Canonical public URL of the app (e.g. `https://shortless.app`), used to build OAuth redirect URIs. */
export const PUBLIC_APP_URL = () => getEnv('PUBLIC_APP_URL');
