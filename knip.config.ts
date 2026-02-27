import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	entry: ['src/**/*.ts', 'src/**/*.svelte'],
	project: ['src/**/*.ts', 'src/**/*.svelte'],
	ignoreDependencies: ['tailwindcss', 'vite-plugin-pwa']
};

export default config;
