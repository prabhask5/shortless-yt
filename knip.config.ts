/**
 * Knip Configuration - Unused Code & Dependency Detector
 *
 * Knip statically analyzes the project to find unused files, exports, and dependencies.
 * This config tells Knip which files are entry points, which to ignore, and how to
 * handle SvelteKit-specific conventions (e.g., file-based routing).
 *
 * Run with: `npx knip`
 *
 * @see https://knip.dev/
 */

import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	/**
	 * Entry points that Knip uses as the starting point for dependency tracing.
	 * Anything not reachable from these entries is considered unused.
	 *
	 * - SvelteKit route files (+page, +layout, +server, etc.)
	 * - The lib barrel export (src/lib/index.ts)
	 * - The app HTML shell
	 * - Build/dev scripts
	 */
	entry: [
		'src/routes/**/*.{ts,svelte}',
		'src/lib/index.ts',
		'src/app.html',
		'scripts/**/*.js'
	],

	/** The full set of project source files that Knip should analyze for unused exports */
	project: ['src/**/*.{ts,svelte}'],

	/**
	 * Files to exclude from the unused-code analysis.
	 *
	 * - logger.ts: Side-effect-only module used at runtime, not statically imported everywhere
	 * - *.d.ts: Type declaration files are consumed by TypeScript, not import-traced by Knip
	 */
	ignore: [
		'src/lib/server/logger.ts',
		'**/*.d.ts'
	],

	/**
	 * Dependencies to exclude from the "unused dependency" report.
	 * These are either dynamically required, used via peer-dependency resolution,
	 * or consumed in ways Knip cannot statically detect:
	 *
	 * - dompurify / isomorphic-dompurify: Used for HTML sanitization; may be imported
	 *   dynamically or through re-exports that Knip misses
	 * - @sveltejs/adapter-node: Referenced only in svelte.config.js as a deploy adapter;
	 *   Knip may not trace this as a "used" dependency
	 */
	ignoreDependencies: [
		'dompurify',
		'isomorphic-dompurify',
		'@sveltejs/adapter-node'
	],

	/** Point Knip to the Svelte config so it understands SvelteKit's file conventions */
	svelte: {
		config: ['svelte.config.js']
	}
};

export default config;
