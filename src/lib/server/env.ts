import { env } from '$env/dynamic/private';

export function getEnv(key: string): string {
	const value = env[key];
	if (!value) throw new Error(`Missing environment variable: ${key}`);
	return value;
}

export const YOUTUBE_API_KEY = () => getEnv('YOUTUBE_API_KEY');
export const GOOGLE_CLIENT_ID = () => getEnv('GOOGLE_CLIENT_ID');
export const GOOGLE_CLIENT_SECRET = () => getEnv('GOOGLE_CLIENT_SECRET');
export const AUTH_SECRET = () => getEnv('AUTH_SECRET');
export const PUBLIC_APP_URL = () => getEnv('PUBLIC_APP_URL');
