import { redirect, isRedirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	consumePkceState,
	exchangeCode,
	getUserProfile,
	createSessionCookie
} from '$lib/server/auth';
import { logAuthEvent } from '$lib/server/logger';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/auth/callback');
	if (!limit.allowed) {
		return new Response('Rate limit exceeded', { status: 429 });
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');

	if (error) {
		logAuthEvent('oauth_error', false);
		redirect(302, '/?auth_error=' + encodeURIComponent(error));
	}

	if (!code || !state) {
		redirect(302, '/?auth_error=missing_params');
	}

	const storedState = cookies.get('oauth_state');
	if (state !== storedState) {
		logAuthEvent('csrf_mismatch', false);
		redirect(302, '/?auth_error=csrf_mismatch');
	}

	cookies.delete('oauth_state', { path: '/' });

	const codeVerifier = consumePkceState(state);
	if (!codeVerifier) {
		redirect(302, '/?auth_error=expired_state');
	}

	try {
		const tokens = await exchangeCode(code, codeVerifier);
		const user = await getUserProfile(tokens.accessToken);
		const sessionCookie = await createSessionCookie(
			tokens.accessToken,
			tokens.refreshToken,
			tokens.expiresIn,
			user
		);

		cookies.set('session_id', sessionCookie, {
			path: '/',
			httpOnly: true,
			secure: false,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7
		});

		logAuthEvent('login_success', true);
		redirect(302, '/');
	} catch (err) {
		if (isRedirect(err)) throw err;
		logAuthEvent('login_failed', false);
		const message = err instanceof Error ? err.message : 'unknown';
		redirect(302, '/?auth_error=' + encodeURIComponent(message));
	}
};
