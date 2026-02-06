// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// YouTube IFrame Player API types
	namespace YT {
		interface Player {
			destroy(): void;
			loadVideoById(videoId: string): void;
		}

		interface PlayerOptions {
			videoId: string;
			width?: string | number;
			height?: string | number;
			playerVars?: Record<string, unknown>;
			events?: {
				onReady?: () => void;
				onError?: () => void;
				onStateChange?: (event: { data: number }) => void;
			};
		}

		const Player: new (elementId: string, options: PlayerOptions) => Player;
	}

	interface Window {
		YT: typeof YT;
		onYouTubeIframeAPIReady: () => void;
	}
}

export {};
