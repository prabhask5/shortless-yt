/**
 * ESLint Flat Configuration
 *
 * Uses ESLint's flat config format (eslint.config.js) with support for:
 *   - JavaScript (ESLint recommended rules)
 *   - TypeScript (via @typescript-eslint)
 *   - Svelte components (via eslint-plugin-svelte)
 *   - Prettier compatibility (disables formatting rules that conflict with Prettier)
 *
 * The configuration is an array of config objects processed in order. Later entries
 * override earlier ones for the same file patterns.
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files
 */

import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
	/** Base JavaScript recommended rules (no-debugger, no-undef, etc.) */
	js.configs.recommended,

	/** Prettier compat: turns off all ESLint rules that would conflict with Prettier formatting */
	prettier,

	/**
	 * TypeScript-specific configuration.
	 * Applied to all .ts files (not .svelte - that's handled separately below).
	 */
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module'
			},
			globals: {
				// Allow both browser globals (window, document) and Node globals (process, __dirname)
				// since the project has both client-side and server-side TypeScript
				...globals.browser,
				...globals.node
			}
		},
		plugins: {
			'@typescript-eslint': ts
		},
		rules: {
			// Start with the recommended TypeScript rules as a baseline
			...ts.configs.recommended.rules,

			// Warn on unused vars, but allow intentionally unused params/vars prefixed with _
			// (common pattern for destructuring or required callback signatures)
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],

			// Allow `any` type - the YouTube API responses are complex and not fully typed
			'@typescript-eslint/no-explicit-any': 'off',

			// Disable base no-undef; TypeScript's own type checker handles this better
			// and won't false-positive on type-only imports or ambient declarations
			'no-undef': 'off'
		}
	},

	/** Svelte recommended lint rules (accessibility, reactivity, component patterns) */
	...svelte.configs['flat/recommended'],

	/** Svelte + Prettier compat: disables Svelte formatting rules that clash with Prettier */
	...svelte.configs['flat/prettier'],

	/**
	 * Svelte component-specific overrides.
	 * Applied to all .svelte files for rules that need different settings in components.
	 */
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				// Use the TypeScript parser for <script lang="ts"> blocks inside Svelte components
				parser: tsParser
			}
		},
		rules: {
			// Allow {@html ...} tags - needed for rendering sanitized HTML content
			// (e.g., video descriptions with links). Content is sanitized with DOMPurify.
			'svelte/no-at-html-tags': 'off',

			// Allow programmatic navigation without $app/navigation resolve()
			'svelte/no-navigation-without-resolve': 'off',

			// Disable these base rules in Svelte files - the Svelte compiler and TypeScript
			// handle undefined/unused variable detection more accurately for reactive contexts
			'no-undef': 'off',
			'no-unused-vars': 'off'
		}
	},

	/**
	 * Global ignore patterns.
	 * These directories/files are excluded from all linting:
	 *   - .svelte-kit/  : Auto-generated SvelteKit build artifacts
	 *   - build/        : Production build output
	 *   - node_modules/ : Third-party packages
	 *   - static/sw.js  : Service worker (runs in SW scope, not standard browser JS)
	 *   - scripts/      : Build utility scripts (simple one-off tooling)
	 */
	{
		ignores: ['.svelte-kit/', 'build/', 'node_modules/', 'static/sw.js', 'scripts/']
	}
];
