/**
 * SvelteKit Configuration
 *
 * This is the main configuration file for the SvelteKit framework. It controls
 * how Svelte components are preprocessed and how the application is adapted
 * for deployment.
 *
 * @see https://svelte.dev/docs/kit/configuration
 */

import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	/**
	 * Enables Vite-based preprocessing for Svelte components.
	 * This handles TypeScript, PostCSS, SCSS, and other languages
	 * inside <script lang="ts"> and <style> blocks automatically
	 * by delegating to Vite's built-in transform pipeline.
	 */
	preprocess: vitePreprocess(),

	kit: {
		/**
		 * adapter-auto automatically detects the deployment platform at build time
		 * (e.g., Vercel, Netlify, Cloudflare) and applies the appropriate adapter.
		 * Falls back to a generic Node.js server if no platform is detected.
		 *
		 * For explicit control, replace with a specific adapter like:
		 *   - @sveltejs/adapter-node (self-hosted Node.js)
		 *   - @sveltejs/adapter-vercel (Vercel)
		 *   - @sveltejs/adapter-static (static site generation)
		 */
		adapter: adapter()
	}
};

export default config;
