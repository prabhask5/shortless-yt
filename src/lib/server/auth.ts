import { env } from '$env/dynamic/private';
import { logAuthEvent, logError } from './logger';
import type { UserProfile } from '$lib/types';
import type { Cookies } from '@sveltejs/kit';

function getClientId(): string {
	return env.GOOGLE_CLIENT_ID || '';
}

function getClientSecret(): string {
	return env.GOOGLE_CLIENT_SECRET || '';
}

function getRedirectUri(): string {
	return env.OAUTH_REDIRECT_URI || 'http://localhost:5173/api/auth/callback';
}

export function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(buffer: Uint8Array): string {
	let binary = '';
	for (const byte of buffer) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
	let padded = str.replace(/-/g, '+').replace(/_/g, '/');
	while (padded.length % 4) padded += '=';
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export function generateState(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

export function buildAuthUrl(state: string, codeChallenge: string): string {
	const params = new URLSearchParams({
		client_id: getClientId(),
		redirect_uri: getRedirectUri(),
		response_type: 'code',
		scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
		state,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
		access_type: 'offline',
		prompt: 'consent'
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

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
			code_verifier: codeVerifier
		})
	});

	if (!res.ok) {
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

export async function getUserProfile(accessToken: string): Promise<UserProfile> {
	const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!res.ok) throw new Error('Failed to fetch user profile');

	const data = await res.json();

	// Try to get YouTube channel
	let channelId: string | undefined;
	try {
		const ytRes = await fetch(
			`https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`,
			{ headers: { Authorization: `Bearer ${accessToken}` } }
		);
		if (ytRes.ok) {
			const ytData = await ytRes.json();
			channelId = ytData.items?.[0]?.id;
		}
	} catch {
		// Channel fetch is optional
	}

	return {
		id: data.id,
		name: data.name,
		email: data.email,
		picture: data.picture,
		channelId
	};
}

// --- Cookie-based session management ---
// Session data is stored in an HMAC-signed cookie so it survives server restarts.

interface SessionPayload {
	at: string; // accessToken
	rt: string; // refreshToken
	ex: number; // expiresAt timestamp
	u: UserProfile; // user
}

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: false,
	sameSite: 'lax' as const,
	maxAge: 60 * 60 * 24 * 7
};

async function getSigningKey(): Promise<CryptoKey> {
	const secret = getClientSecret();
	return crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

async function signData(data: string): Promise<string> {
	const key = await getSigningKey();
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
	return base64UrlEncode(new Uint8Array(sig));
}

async function verifySignature(data: string, signature: string): Promise<boolean> {
	const key = await getSigningKey();
	const sigBytes = base64UrlDecode(signature);
	return crypto.subtle.verify(
		'HMAC',
		key,
		sigBytes.buffer as ArrayBuffer,
		new TextEncoder().encode(data)
	);
}

export async function createSessionCookie(
	accessToken: string,
	refreshToken: string | undefined,
	expiresIn: number,
	user: UserProfile
): Promise<string> {
	const payload: SessionPayload = {
		at: accessToken,
		rt: refreshToken || '',
		ex: Date.now() + expiresIn * 1000,
		u: user
	};
	const json = JSON.stringify(payload);
	const encoded = base64UrlEncode(new TextEncoder().encode(json));
	const sig = await signData(encoded);
	return `${encoded}.${sig}`;
}

async function decodeSessionCookie(cookieValue: string): Promise<SessionPayload | null> {
	try {
		const dotIndex = cookieValue.lastIndexOf('.');
		if (dotIndex === -1) return null;

		const encoded = cookieValue.substring(0, dotIndex);
		const sig = cookieValue.substring(dotIndex + 1);

		const valid = await verifySignature(encoded, sig);
		if (!valid) return null;

		const json = new TextDecoder().decode(base64UrlDecode(encoded));
		return JSON.parse(json) as SessionPayload;
	} catch {
		return null;
	}
}

export async function getValidSession(
	cookieValue: string,
	cookies?: Cookies
): Promise<{ accessToken: string; user: UserProfile } | null> {
	const session = await decodeSessionCookie(cookieValue);
	if (!session) return null;

	// Check if access token needs refresh (60s buffer)
	if (Date.now() >= session.ex - 60000) {
		if (session.rt) {
			try {
				const refreshed = await refreshAccessToken(session.rt);
				// Update cookie with new access token
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
				return null;
			}
		}
		return null;
	}

	return { accessToken: session.at, user: session.u };
}

// PKCE state storage (in-memory is fine — only lives for ~5 min during login flow)
const pkceStates = new Map<string, { codeVerifier: string; createdAt: number }>();

export function storePkceState(state: string, codeVerifier: string): void {
	pkceStates.set(state, { codeVerifier, createdAt: Date.now() });
	// Clean old states
	const fiveMinAgo = Date.now() - 5 * 60 * 1000;
	for (const [k, v] of pkceStates) {
		if (v.createdAt < fiveMinAgo) pkceStates.delete(k);
	}
}

export function consumePkceState(state: string): string | null {
	const entry = pkceStates.get(state);
	if (!entry) return null;
	pkceStates.delete(state);
	// Expired check
	if (Date.now() - entry.createdAt > 5 * 60 * 1000) return null;
	return entry.codeVerifier;
}
