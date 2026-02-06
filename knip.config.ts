import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	entry: [
		'src/routes/**/*.{ts,svelte}',
		'src/lib/index.ts',
		'src/app.html',
		'scripts/**/*.js'
	],
	project: ['src/**/*.{ts,svelte}'],
	ignore: [
		'src/lib/server/logger.ts', // logging utilities used at runtime
		'**/*.d.ts'
	],
	ignoreDependencies: [
		'dompurify',
		'isomorphic-dompurify',
		'@sveltejs/adapter-node'
	],
	svelte: {
		config: ['svelte.config.js']
	}
};

export default config;
