import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		csp: {
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': [
					'self',
					'https://*.ytimg.com',
					'https://*.ggpht.com',
					'https://*.googleusercontent.com',
					'data:'
				],
				'frame-src': ['https://www.youtube.com'],
				'connect-src': ['self'],
				'font-src': ['self'],
				'worker-src': ['self']
			}
		}
	}
};

export default config;
