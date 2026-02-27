/**
 * @fileoverview Root layout server load function.
 *
 * Provides user session data to all pages via SvelteKit's data cascading.
 * Every child route automatically receives the `user` field in its `data` prop,
 * allowing components to render conditionally based on authentication state.
 *
 * The session itself (with tokens) stays server-side in `locals`; only safe,
 * display-oriented fields (avatar URL, channel title) are sent to the client.
 */
import type { LayoutServerLoad } from './$types';
import { getUserProfile } from '$lib/server/youtube';

export const load: LayoutServerLoad = async ({ locals }) => {
	console.log('[LAYOUT] Root layout load, session present:', !!locals.session);
	if (locals.session) {
		console.log('[LAYOUT] Fetching user profile from YouTube API...');
		const profile = await getUserProfile(locals.session.accessToken);
		console.log('[LAYOUT] User profile:', profile ? profile.channelTitle : 'null (fetch failed)');
		return {
			user: profile ?? { avatarUrl: '', channelTitle: '' }
		};
	}
	console.log('[LAYOUT] No session — returning user: null');
	return { user: null };
};
