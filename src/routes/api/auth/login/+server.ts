import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	generateCodeVerifier,
	generateCodeChallenge,
	generateState,
	buildAuthUrl,
	storePkceState
} from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ getClientAddress, cookies }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/auth/login');
	if (!limit.allowed) {
		return new Response('Rate limit exceeded', { status: 429 });
	}

	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);

	storePkceState(state, codeVerifier);

	cookies.set('oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: false,
		sameSite: 'lax',
		maxAge: 300
	});

	const authUrl = buildAuthUrl(state, codeChallenge);
	redirect(302, authUrl);
};
