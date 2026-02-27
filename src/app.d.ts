declare global {
	namespace App {
		interface Locals {
			session: {
				accessToken: string;
				refreshToken: string;
				expiresAt: number;
			} | null;
		}
	}
}

export {};
