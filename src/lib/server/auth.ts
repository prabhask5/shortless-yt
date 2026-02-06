import { env } from '$env/dynamic/private';
import { logAuthEvent, logError } from './logger';
import type { UserProfile } from '$lib/types';

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

// Session storage (in-memory for simplicity; production should use Redis/DB)
interface Session {
	id: string;
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
	user: UserProfile;
	createdAt: number;
}

const sessions = new Map<string, Session>();

export function createSession(
	accessToken: string,
	refreshToken: string | undefined,
	expiresIn: number,
	user: UserProfile
): string {
	const sessionId = generateState() + generateState(); // longer session id
	sessions.set(sessionId, {
		id: sessionId,
		accessToken,
		refreshToken,
		expiresAt: Date.now() + expiresIn * 1000,
		user,
		createdAt: Date.now()
	});
	return sessionId;
}

export function deleteSession(sessionId: string): void {
	sessions.delete(sessionId);
}

export async function getValidSession(sessionId: string): Promise<Session | null> {
	const session = sessions.get(sessionId);
	if (!session) return null;

	// Check if access token is expired
	if (Date.now() >= session.expiresAt - 60000) {
		if (session.refreshToken) {
			try {
				const refreshed = await refreshAccessToken(session.refreshToken);
				session.accessToken = refreshed.accessToken;
				session.expiresAt = Date.now() + refreshed.expiresIn * 1000;
				return session;
			} catch {
				sessions.delete(sessionId);
				return null;
			}
		} else {
			sessions.delete(sessionId);
			return null;
		}
	}

	return session;
}

// PKCE state storage
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
