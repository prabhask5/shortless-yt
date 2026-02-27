import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoogleAuthUrl } from '$lib/server/auth';

export const GET: RequestHandler = async () => {
	const url = getGoogleAuthUrl();
	throw redirect(302, url);
};
