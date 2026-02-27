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
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAutocompleteSuggestions } from '$lib/server/youtube';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	if (!query) {
		return json([]);
	}

	const suggestions = await getAutocompleteSuggestions(query);
	return json(suggestions);
};
