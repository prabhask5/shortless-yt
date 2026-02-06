import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSession } from '$lib/server/auth';
import { logAuthEvent } from '$lib/server/logger';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('session_id');
	if (sessionId) {
		deleteSession(sessionId);
		cookies.delete('session_id', { path: '/' });
	}
	logAuthEvent('logout', true);
	return json({ success: true });
};
