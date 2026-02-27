import { writable } from 'svelte/store';

interface AuthState {
	user: { avatarUrl: string; channelTitle: string } | null;
	isLoading: boolean;
}

export const authState = writable<AuthState>({ user: null, isLoading: true });
