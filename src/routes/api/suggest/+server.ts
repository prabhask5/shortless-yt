/**
 * @fileoverview Search autocomplete suggestions proxy endpoint.
 *
 * This server-side proxy exists because the YouTube autocomplete API does not
 * set CORS headers, so the browser cannot call it directly from client-side
 * JavaScript. By routing through our own server endpoint, the Header's search
 * bar can fetch suggestions without CORS issues.
 *
 * Returns a JSON array of suggestion strings (or an empty array if no query).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAutocompleteSuggestions } from '$lib/server/youtube';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');

	if (!query) {
		return json([]);
	}
	if (query.length > 200) throw error(400, 'q too long');

	try {
		const suggestions = await getAutocompleteSuggestions(query);
		/* Cache for 5 minutes — autocomplete suggestions for the same prefix
		 * are stable over short periods. Allows browsers to serve repeat requests
		 * (e.g. user re-typing a previous query) without hitting the server. */
		return json(suggestions, {
			headers: { 'Cache-Control': 'public, max-age=300' }
		});
	} catch (err) {
		console.error('[API SUGGEST] getAutocompleteSuggestions FAILED:', err);
		return json([]);
	}
};
