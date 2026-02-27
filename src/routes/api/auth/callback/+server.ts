import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode, encryptSession, SESSION_COOKIE_NAME } from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	if (!code) {
		throw error(400, 'Missing authorization code');
	}

	const errorParam = url.searchParams.get('error');
	if (errorParam) {
		throw error(400, `OAuth error: ${errorParam}`);
	}

	const tokens = await exchangeCode(code);

	const session = {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + tokens.expires_in * 1000
	};

	const encrypted = encryptSession(session);

	cookies.set(SESSION_COOKIE_NAME, encrypted, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30 // 30 days
	});

	throw redirect(302, '/');
};
