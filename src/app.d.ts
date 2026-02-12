/**
 * SvelteKit Ambient Type Declarations
 *
 * This file provides global TypeScript type declarations that are available
 * throughout the application without explicit imports. SvelteKit automatically
 * includes this file in the TypeScript compilation context.
 *
 * It declares two things:
 *   1. SvelteKit's App namespace (for extending framework interfaces)
 *   2. YouTube IFrame Player API types (for the embedded video player)
 *
 * @see https://svelte.dev/docs/kit/types#app.d.ts
 */

declare global {
	/**
	 * SvelteKit App Namespace
	 *
	 * These interfaces can be extended to add custom types to SvelteKit's
	 * built-in types. They are currently commented out (using defaults).
	 *
	 * Available interfaces:
	 *   - Error:     Custom error shape returned by `error()` helper
	 *   - Locals:    Server-side request-scoped data (available in hooks and endpoints)
	 *   - PageData:  Shape of data returned by all `+page.server.ts` load functions
	 *   - PageState: Custom state for `pushState()` / `replaceState()` navigation
	 *   - Platform:  Platform-specific context from the deployment adapter
	 */
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/**
	 * YouTube IFrame Player API Type Declarations
	 *
	 * Provides TypeScript types for the YouTube IFrame Player API, which is
	 * loaded as an external script (`https://www.youtube.com/iframe_api`).
	 * Since this is a third-party global API with no npm type package,
	 * we declare the types manually here.
	 *
	 * These types cover the subset of the API used by this app (creating
	 * players, loading videos, and handling player events).
	 *
	 * @see https://developers.google.com/youtube/iframe_api_reference
	 */
	namespace YT {
		/** Represents an embedded YouTube video player instance */
		interface Player {
			/** Removes the player iframe from the DOM and cleans up resources */
			destroy(): void;
			/** Loads and plays a new video in the existing player by its YouTube video ID */
			loadVideoById(videoId: string): void;
		}

		/** Configuration options passed when constructing a new YT.Player instance */
		interface PlayerOptions {
			/** The YouTube video ID to initially load (e.g., "dQw4w9WgXcQ") */
			videoId: string;
			/** Player width in pixels or as a CSS string (e.g., "100%") */
			width?: string | number;
			/** Player height in pixels or as a CSS string */
			height?: string | number;
			/**
			 * YouTube player parameters that control player behavior.
			 * Common options: autoplay, controls, modestbranding, rel, etc.
			 * @see https://developers.google.com/youtube/player_parameters
			 */
			playerVars?: Record<string, unknown>;
			/** Event callback handlers for player lifecycle events */
			events?: {
				/** Fired when the player has loaded and is ready to receive API calls */
				onReady?: () => void;
				/** Fired when the player encounters an unrecoverable error */
				onError?: () => void;
				/**
				 * Fired when the player's playback state changes.
				 * event.data contains the new state:
				 *   -1 = unstarted, 0 = ended, 1 = playing, 2 = paused,
				 *    3 = buffering, 5 = video cued
				 */
				onStateChange?: (event: { data: number }) => void;
			};
		}

		/**
		 * The YT.Player constructor. Creates a new YouTube player inside the
		 * specified DOM element.
		 *
		 * @param elementId - The id attribute of the DOM element to replace with the player iframe
		 * @param options   - Player configuration (video ID, dimensions, params, event handlers)
		 */
		const Player: new (elementId: string, options: PlayerOptions) => Player;
	}

	/**
	 * Extends the global Window interface with YouTube IFrame API properties.
	 *
	 * - YT: The YouTube IFrame API namespace (available after the API script loads)
	 * - onYouTubeIframeAPIReady: Callback function that YouTube's script calls
	 *   once the API has fully loaded. The app sets this before loading the script
	 *   to know when it's safe to create YT.Player instances.
	 */
	interface Window {
		YT: typeof YT;
		onYouTubeIframeAPIReady: () => void;
	}
}

/**
 * Empty export to make this file a module.
 * Without this, TypeScript would treat the file as a script (not a module),
 * and the `declare global` block would not work correctly.
 */
export {};
