/**
 * OAuth 2.0 Authentication Module for Shortless YT
 *
 * Implements the Google OAuth 2.0 Authorization Code flow with PKCE
 * (Proof Key for Code Exchange) to authenticate users and obtain access
 * to their YouTube account data (subscriptions, playlists, etc.).
 *
 * OAuth Flow Overview:
 * 1. Client initiates login -> server generates a PKCE code verifier/challenge
 *    and a random state parameter, then redirects the user to Google's auth page.
 * 2. User consents -> Google redirects back to our callback with an authorization code.
 * 3. Server exchanges the authorization code + PKCE verifier for tokens
 *    (access token, refresh token, ID token).
 * 4. Server creates an HMAC-signed session cookie containing the tokens and user profile.
 * 5. On subsequent requests, the session cookie is decoded and verified; if the
 *    access token has expired, it is silently refreshed using the stored refresh token.
 *
 * Security features:
 * - PKCE prevents authorization code interception attacks (RFC 7636).
 * - HMAC-signed cookies ensure session integrity (tampering is detected).
 * - httpOnly cookies prevent client-side JavaScript from accessing session tokens.
 * - State parameter prevents CSRF during the OAuth redirect flow.
 * - In-memory PKCE state storage auto-expires entries after 5 minutes.
 *
 * Note: Cookie values are signed but NOT encrypted. The access/refresh tokens are
 * base64url-encoded in the cookie and visible to anyone inspecting it. This is
 * acceptable because httpOnly prevents JS access and the tokens are scoped to
 * read-only YouTube data, but encryption could be added for defense-in-depth.
 */

import { env } from '$env/dynamic/private';
import { logAuthEvent, logError } from './logger';
import type { UserProfile } from '$lib/types';
import type { Cookies } from '@sveltejs/kit';

// =============================================================================
// Environment Configuration Accessors
// =============================================================================

/**
 * Retrieves the Google OAuth 2.0 client ID from environment variables.
 * @returns The client ID string, or an empty string if not configured.
 */
function getClientId(): string {
	return env.GOOGLE_CLIENT_ID || '';
}

/**
 * Retrieves the Google OAuth 2.0 client secret from environment variables.
 * This secret is also reused as the HMAC signing key for session cookies.
 * @returns The client secret string, or an empty string if not configured.
 */
function getClientSecret(): string {
	return env.GOOGLE_CLIENT_SECRET || '';
}

/**
 * Retrieves the OAuth redirect URI from environment variables.
 * This must exactly match one of the authorized redirect URIs configured
 * in the Google Cloud Console for the OAuth client.
 * @returns The redirect URI, defaulting to localhost:5173 for local development.
 */
function getRedirectUri(): string {
	return env.OAUTH_REDIRECT_URI || 'http://localhost:5173/api/auth/callback';
}

// =============================================================================
// PKCE (Proof Key for Code Exchange) Utilities
// =============================================================================

/**
 * Generates a cryptographically random PKCE code verifier.
 *
 * The code verifier is a high-entropy random string that the client creates
 * before initiating the OAuth flow. It is stored server-side and later sent
 * during the token exchange to prove that the same party that started the
 * flow is the one completing it.
 *
 * @returns A 43-character base64url-encoded random string (256 bits of entropy).
 */
export function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

/**
 * Derives a PKCE code challenge from the given code verifier using SHA-256.
 *
 * The code challenge is a one-way hash of the verifier, sent to Google's
 * authorization endpoint. Google stores it and later verifies that the
 * code verifier provided during token exchange hashes to this same value.
 * This prevents attackers who intercept the authorization code from using
 * it, since they would not have the original verifier.
 *
 * @param verifier - The PKCE code verifier to derive the challenge from.
 * @returns A base64url-encoded SHA-256 hash of the verifier.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return base64UrlEncode(new Uint8Array(digest));
}

// =============================================================================
// Base64url Encoding/Decoding (RFC 4648 Section 5)
// =============================================================================

/**
 * Encodes a byte array to a base64url string (URL-safe, no padding).
 *
 * Standard base64 uses '+' and '/' which are not URL-safe, and '=' padding
 * can cause issues in query parameters. Base64url replaces these characters
 * and strips padding, making the output safe for URLs, cookies, and headers.
 *
 * @param buffer - The byte array to encode.
 * @returns A base64url-encoded string with no padding characters.
 */
function base64UrlEncode(buffer: Uint8Array): string {
	let binary = '';
	for (const byte of buffer) {
		binary += String.fromCharCode(byte);
	}
	// Convert to standard base64, then replace URL-unsafe chars and strip padding
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes a base64url string back to a byte array.
 *
 * Reverses the base64url encoding: restores standard base64 characters,
 * re-adds padding as needed, then decodes to raw bytes.
 *
 * @param str - The base64url-encoded string to decode.
 * @returns The decoded byte array.
 */
function base64UrlDecode(str: string): Uint8Array {
	// Restore standard base64 characters from their URL-safe replacements
	let padded = str.replace(/-/g, '+').replace(/_/g, '/');
	// Re-add padding to make the length a multiple of 4 (required by atob)
	while (padded.length % 4) padded += '=';
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

// =============================================================================
// OAuth Flow: Authorization URL & Token Exchange
// =============================================================================

/**
 * Generates a cryptographically random state parameter for CSRF protection.
 *
 * The state value is included in the authorization URL and returned by Google
 * in the callback. By comparing the returned state to the stored value, we
 * can verify that the callback was initiated by our application and not by
 * a malicious third party (Cross-Site Request Forgery protection).
 *
 * @returns A 22-character base64url-encoded random string (128 bits of entropy).
 */
export function generateState(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

/**
 * Builds the full Google OAuth 2.0 authorization URL that the user will be
 * redirected to in order to grant consent.
 *
 * @param state - The CSRF-prevention state parameter (generated by {@link generateState}).
 * @param codeChallenge - The PKCE code challenge (generated by {@link generateCodeChallenge}).
 * @returns The complete authorization URL to redirect the user to.
 */
export function buildAuthUrl(state: string, codeChallenge: string): string {
	const params = new URLSearchParams({
		client_id: getClientId(),
		redirect_uri: getRedirectUri(),
		response_type: 'code',
		// Request OpenID Connect scopes (profile info) plus read-only YouTube access
		scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
		state,
		code_challenge: codeChallenge,
		// S256 = SHA-256 hashed PKCE challenge (more secure than plain)
		code_challenge_method: 'S256',
		// 'offline' requests a refresh token so we can renew access without re-prompting
		access_type: 'offline',
		// 'consent' forces the consent screen every time, ensuring we always get a refresh token.
		// Without this, Google only issues a refresh token on the first authorization.
		prompt: 'consent'
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges an authorization code for OAuth tokens (Step 3 of the OAuth flow).
 *
 * After the user grants consent, Google redirects back with an authorization code.
 * This function sends the code along with the PKCE verifier to Google's token
 * endpoint to obtain an access token, refresh token, and ID token.
 *
 * The PKCE verifier proves that this is the same party that initiated the flow,
 * preventing authorization code interception attacks.
 *
 * @param code - The authorization code received from Google's callback.
 * @param codeVerifier - The original PKCE code verifier that was generated at the start of the flow.
 * @returns An object containing the access token, optional refresh token, optional ID token,
 *          and the token's lifetime in seconds.
 * @throws {Error} If the token exchange request fails (e.g., invalid code, expired code,
 *         mismatched PKCE verifier, or revoked client credentials).
 */
export async function exchangeCode(
	code: string,
	codeVerifier: string
): Promise<{ accessToken: string; refreshToken?: string; idToken?: string; expiresIn: number }> {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: getClientId(),
			client_secret: getClientSecret(),
			redirect_uri: getRedirectUri(),
			grant_type: 'authorization_code',
			// The verifier must hash to the challenge that was sent in the auth URL
			code_verifier: codeVerifier
		})
	});

	if (!res.ok) {
		// Log a truncated response body for debugging without leaking excessive data
		const body = await res.text();
		logError('OAuth token exchange failed', { status: res.status, body: body.slice(0, 500) });
		throw new Error(`Token exchange failed: ${res.status}`);
	}

	const data = await res.json();
	logAuthEvent('token_exchange', true);
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		idToken: data.id_token,
		expiresIn: data.expires_in
	};
}

// =============================================================================
// Token Refresh
// =============================================================================

/**
 * Refreshes an expired access token using a stored refresh token.
 *
 * Google access tokens typically expire after 1 hour. Rather than forcing the
 * user to re-authenticate, we use the long-lived refresh token to obtain a new
 * access token silently. Note that Google may revoke refresh tokens if they are
 * unused for 6 months or if the user revokes access.
 *
 * @param refreshToken - The refresh token obtained during the original token exchange.
 * @returns An object containing the new access token and its lifetime in seconds.
 * @throws {Error} If the refresh request fails (e.g., refresh token revoked or expired).
 */
async function refreshAccessToken(
	refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: getClientId(),
			client_secret: getClientSecret(),
			grant_type: 'refresh_token'
		})
	});

	if (!res.ok) {
		logError('Token refresh failed', { status: res.status });
		throw new Error('Token refresh failed');
	}

	const data = await res.json();
	logAuthEvent('token_refresh', true);
	return {
		accessToken: data.access_token,
		expiresIn: data.expires_in
	};
}

// =============================================================================
// User Profile Retrieval
// =============================================================================

/**
 * Fetches the authenticated user's profile from Google and their YouTube channel ID.
 *
 * Makes two API calls:
 * 1. Google OAuth2 userinfo endpoint for name, email, and profile picture.
 * 2. YouTube Data API v3 channels endpoint to retrieve the user's own channel ID
 *    (used for linking to their channel within the app).
 *
 * The YouTube channel fetch is best-effort; if it fails (e.g., user has no
 * YouTube channel, quota exceeded), the profile is still returned without a channelId.
 *
 * @param accessToken - A valid Google OAuth access token with openid, profile, email,
 *                      and youtube.readonly scopes.
 * @returns The user's profile containing id, name, email, picture, and optional channelId.
 * @throws {Error} If the primary userinfo request fails (YouTube channel fetch failures are swallowed).
 */
export async function getUserProfile(accessToken: string): Promise<UserProfile> {
	const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!res.ok) throw new Error('Failed to fetch user profile');

	const data = await res.json();

	// Try to get the user's YouTube channel ID (best-effort, non-blocking on failure)
	let channelId: string | undefined;
	try {
		const ytRes = await fetch(
			`https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`,
			{ headers: { Authorization: `Bearer ${accessToken}` } }
		);
		if (ytRes.ok) {
			const ytData = await ytRes.json();
			// The user may have zero channels (e.g., brand-new Google account)
			channelId = ytData.items?.[0]?.id;
		}
	} catch {
		// Channel fetch is optional -- fail silently so login still succeeds
	}

	return {
		id: data.id,
		name: data.name,
		email: data.email,
		picture: data.picture,
		channelId
	};
}

// =============================================================================
// Cookie-Based Session Management
// =============================================================================
//
// Session data (tokens + user profile) is serialized to JSON, base64url-encoded,
// and stored in an HMAC-signed cookie. This approach:
// - Survives server restarts (no server-side session store needed).
// - Ensures integrity via HMAC signature (tampering is detected).
// - Uses httpOnly to prevent client-side JS from reading session tokens.
//
// Cookie format: <base64url-encoded-JSON>.<base64url-encoded-HMAC-signature>
// This is conceptually similar to a simplified JWT (header is implicit).

/**
 * Internal session payload stored inside the signed cookie.
 * Field names are abbreviated to minimize cookie size (browsers enforce ~4KB limit).
 */
interface SessionPayload {
	at: string; // accessToken - Google OAuth access token
	rt: string; // refreshToken - Google OAuth refresh token (long-lived)
	ex: number; // expiresAt - Unix timestamp (ms) when the access token expires
	u: UserProfile; // user - Cached user profile to avoid re-fetching on every request
}

/**
 * Default options applied to the session cookie.
 *
 * Security notes:
 * - httpOnly: true prevents JavaScript access (mitigates XSS token theft).
 * - secure: false allows HTTP in development. Should be set to true in production
 *   to ensure the cookie is only sent over HTTPS.
 * - sameSite: 'lax' provides basic CSRF protection while allowing top-level
 *   navigations (e.g., OAuth redirect back from Google).
 * - maxAge: 7 days. The cookie persists for a week; token refresh handles
 *   keeping the access token valid within that window.
 */
const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: false,
	sameSite: 'lax' as const,
	maxAge: 60 * 60 * 24 * 7
};

// =============================================================================
// HMAC Signing & Verification (Cookie Integrity)
// =============================================================================

/**
 * Derives an HMAC-SHA256 signing key from the OAuth client secret.
 *
 * Reuses the client secret as the HMAC key to avoid requiring an additional
 * environment variable. The key is imported as non-extractable for security.
 *
 * @returns A CryptoKey suitable for HMAC sign/verify operations.
 */
async function getSigningKey(): Promise<CryptoKey> {
	const secret = getClientSecret();
	return crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false, // non-extractable: the key material cannot be exported once imported
		['sign', 'verify']
	);
}

/**
 * Computes an HMAC-SHA256 signature over the given data string.
 *
 * @param data - The string to sign (typically the base64url-encoded session payload).
 * @returns The base64url-encoded HMAC signature.
 */
async function signData(data: string): Promise<string> {
	const key = await getSigningKey();
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
	return base64UrlEncode(new Uint8Array(sig));
}

/**
 * Verifies an HMAC-SHA256 signature against the given data string.
 *
 * Uses the Web Crypto API's constant-time comparison internally,
 * which prevents timing attacks that could leak signature information.
 *
 * @param data - The original data string that was signed.
 * @param signature - The base64url-encoded HMAC signature to verify.
 * @returns True if the signature is valid, false otherwise.
 */
async function verifySignature(data: string, signature: string): Promise<boolean> {
	const key = await getSigningKey();
	const sigBytes = base64UrlDecode(signature);
	return crypto.subtle.verify(
		'HMAC',
		key,
		// Cast needed because TypeScript's lib types expect ArrayBuffer, but
		// Uint8Array.buffer returns ArrayBufferLike which is compatible at runtime
		sigBytes.buffer as ArrayBuffer,
		new TextEncoder().encode(data)
	);
}

// =============================================================================
// Session Cookie Creation & Decoding
// =============================================================================

/**
 * Creates a signed session cookie value from the given authentication data.
 *
 * The session payload (tokens + user profile) is JSON-serialized, base64url-encoded,
 * then HMAC-signed. The final cookie value is formatted as `<payload>.<signature>`.
 *
 * @param accessToken - The Google OAuth access token.
 * @param refreshToken - The Google OAuth refresh token, or undefined if not available.
 * @param expiresIn - The access token's lifetime in seconds (typically 3600 for Google).
 * @param user - The authenticated user's profile.
 * @returns The signed cookie value string in the format `<base64url-payload>.<base64url-signature>`.
 */
export async function createSessionCookie(
	accessToken: string,
	refreshToken: string | undefined,
	expiresIn: number,
	user: UserProfile
): Promise<string> {
	const payload: SessionPayload = {
		at: accessToken,
		rt: refreshToken || '',
		// Convert relative expiry (seconds from now) to absolute timestamp (ms)
		ex: Date.now() + expiresIn * 1000,
		u: user
	};
	const json = JSON.stringify(payload);
	const encoded = base64UrlEncode(new TextEncoder().encode(json));
	const sig = await signData(encoded);
	// Format: <payload>.<signature> (similar to a two-part JWT without the header)
	return `${encoded}.${sig}`;
}

/**
 * Decodes and verifies a signed session cookie value.
 *
 * Splits the cookie at the last dot to separate payload from signature,
 * verifies the HMAC signature to ensure the cookie has not been tampered with,
 * then decodes and parses the JSON payload.
 *
 * @param cookieValue - The raw cookie string in the format `<base64url-payload>.<base64url-signature>`.
 * @returns The decoded session payload if the signature is valid, or null if the cookie
 *          is malformed, has an invalid signature, or cannot be parsed.
 */
async function decodeSessionCookie(cookieValue: string): Promise<SessionPayload | null> {
	try {
		// Split at the LAST dot, since base64url payloads never contain dots
		// but we use lastIndexOf for extra safety
		const dotIndex = cookieValue.lastIndexOf('.');
		if (dotIndex === -1) return null;

		const encoded = cookieValue.substring(0, dotIndex);
		const sig = cookieValue.substring(dotIndex + 1);

		// Verify HMAC signature before trusting any of the payload data
		const valid = await verifySignature(encoded, sig);
		if (!valid) return null;

		const json = new TextDecoder().decode(base64UrlDecode(encoded));
		return JSON.parse(json) as SessionPayload;
	} catch {
		// Any decoding/parsing error means the cookie is invalid
		return null;
	}
}

// =============================================================================
// Session Validation & Token Refresh
// =============================================================================

/**
 * Validates a session cookie and returns a usable access token and user profile.
 *
 * This is the primary entry point for authentication checks on protected routes.
 * It performs the following steps:
 * 1. Decodes and verifies the session cookie's HMAC signature.
 * 2. Checks whether the access token has expired (with a 60-second buffer to
 *    avoid race conditions where a token expires mid-request).
 * 3. If expired and a refresh token is available, silently refreshes the access
 *    token and updates the session cookie with the new token.
 * 4. If the token cannot be refreshed (no refresh token, or refresh failed),
 *    returns null to indicate the session is invalid (user must re-authenticate).
 *
 * @param cookieValue - The raw session cookie string.
 * @param cookies - Optional SvelteKit Cookies object. If provided and a token refresh
 *                  occurs, the session cookie will be updated in the response automatically.
 *                  Pass this when handling requests where you can set response cookies
 *                  (e.g., in server load functions or API routes).
 * @returns An object with the valid access token and user profile, or null if the
 *          session is invalid or expired beyond recovery.
 */
export async function getValidSession(
	cookieValue: string,
	cookies?: Cookies
): Promise<{ accessToken: string; user: UserProfile } | null> {
	const session = await decodeSessionCookie(cookieValue);
	if (!session) return null;

	// Check if access token needs refresh. The 60-second buffer ensures we refresh
	// slightly before expiry, preventing edge cases where the token expires between
	// this check and the actual API call that uses it.
	if (Date.now() >= session.ex - 60000) {
		if (session.rt) {
			try {
				const refreshed = await refreshAccessToken(session.rt);
				// If a Cookies object was provided, persist the refreshed token
				// back to the client so subsequent requests use the new token
				if (cookies) {
					const newCookie = await createSessionCookie(
						refreshed.accessToken,
						session.rt,
						refreshed.expiresIn,
						session.u
					);
					cookies.set('session_id', newCookie, COOKIE_OPTIONS);
				}
				return { accessToken: refreshed.accessToken, user: session.u };
			} catch {
				// Refresh failed (token revoked, network error, etc.) -- session is dead
				return null;
			}
		}
		// No refresh token available and access token is expired -- cannot recover
		return null;
	}

	// Access token is still valid; return it directly
	return { accessToken: session.at, user: session.u };
}

// =============================================================================
// PKCE State Storage (In-Memory)
// =============================================================================
//
// Stores PKCE code verifiers keyed by their corresponding state parameter.
// In-memory storage is acceptable here because:
// - PKCE state only needs to survive for the ~30 seconds between initiating
//   login and completing the OAuth callback.
// - The 5-minute TTL provides ample margin for slow connections.
// - In a multi-instance deployment, this would need to be replaced with a
//   shared store (e.g., Redis), but for a single-server app this is sufficient.

/** In-memory map of state -> { codeVerifier, createdAt } for active OAuth flows. */
const pkceStates = new Map<string, { codeVerifier: string; createdAt: number }>();

/**
 * Stores a PKCE code verifier associated with a given state parameter.
 *
 * Called at the start of the OAuth flow (before redirecting to Google).
 * Also performs opportunistic cleanup of expired entries to prevent unbounded
 * memory growth from abandoned login flows.
 *
 * @param state - The random state parameter that will be included in the auth URL.
 * @param codeVerifier - The PKCE code verifier to store for later retrieval during callback.
 */
export function storePkceState(state: string, codeVerifier: string): void {
	pkceStates.set(state, { codeVerifier, createdAt: Date.now() });
	// Opportunistic cleanup: remove any entries older than 5 minutes to prevent
	// memory leaks from users who start but never complete the login flow
	const fiveMinAgo = Date.now() - 5 * 60 * 1000;
	for (const [k, v] of pkceStates) {
		if (v.createdAt < fiveMinAgo) pkceStates.delete(k);
	}
}

/**
 * Retrieves and removes the PKCE code verifier for a given state parameter.
 *
 * Called during the OAuth callback to retrieve the verifier needed for
 * token exchange. The entry is immediately deleted to ensure single-use
 * (prevents replay attacks where an attacker reuses a captured callback URL).
 *
 * @param state - The state parameter received from Google's OAuth callback.
 * @returns The code verifier if the state is valid and not expired, or null if
 *          the state is unknown, already consumed, or older than 5 minutes.
 */
export function consumePkceState(state: string): string | null {
	const entry = pkceStates.get(state);
	if (!entry) return null;
	// Delete immediately to enforce single-use (prevents replay)
	pkceStates.delete(state);
	// Reject if the OAuth flow took longer than 5 minutes (likely stale/abandoned)
	if (Date.now() - entry.createdAt > 5 * 60 * 1000) return null;
	return entry.codeVerifier;
}
