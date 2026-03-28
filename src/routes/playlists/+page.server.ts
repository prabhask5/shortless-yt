import { redirect } from '@sveltejs/kit';
import { getMyPlaylists } from '$lib/server/youtube';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session) redirect(302, '/api/auth/login');

	const playlists = await getMyPlaylists(locals.session.accessToken, locals.session.channelId);

	return { playlists };
};
