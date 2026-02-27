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
