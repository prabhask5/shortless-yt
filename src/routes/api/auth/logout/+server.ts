import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logAuthEvent } from '$lib/server/logger';

export const POST: RequestHandler = async ({ cookies }) => {
	cookies.delete('session_id', { path: '/' });
	logAuthEvent('logout', true);
	return json({ success: true });
};
