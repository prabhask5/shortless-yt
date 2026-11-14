/**
 * @fileoverview Liveness endpoint for container health checks and uptime monitors.
 * Reports whether the Redis L2 cache is connected; the app works without it.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isRedisAvailable } from '$lib/server/redis';

export const GET: RequestHandler = () =>
	json({ status: 'ok', redis: isRedisAvailable() }, { headers: { 'Cache-Control': 'no-store' } });
