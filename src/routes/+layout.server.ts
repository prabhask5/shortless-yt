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

export const load: LayoutServerLoad = async ({ locals }) => {
	if (locals.session) {
		/* User is authenticated -- return minimal profile info for the Header.
		 * Avatar and channel title are currently empty placeholders because
		 * fetching the full profile here would add latency to every navigation. */
		return {
			user: {
				avatarUrl: '',
				channelTitle: ''
			}
		};
	}
	return { user: null };
};
