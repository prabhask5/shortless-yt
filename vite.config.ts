/**
 * Vite Configuration for Shortless YT
 *
 * Configures the Vite build tool for the SvelteKit application. This file handles:
 *   1. SvelteKit integration via the official Vite plugin
 *   2. Custom service worker versioning and asset manifest generation
 *   3. Build optimizations including vendor chunk splitting and modern browser targeting
 *
 * The custom `serviceWorkerVersion` plugin ensures the service worker (static/sw.js)
 * gets a fresh version stamp on every build, which triggers cache invalidation for
 * returning users. It also produces an asset manifest (asset-manifest.json) that the
 * service worker can use to precache immutable build assets.
 *
 * @see https://vite.dev/config/
 */

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Recursively collects all file paths within a directory tree.
 *
 * @param dir   - The root directory to start traversal from.
 * @param files - Accumulator array that collects file paths across recursive calls.
 * @returns An array of absolute file paths found under `dir`.
 */
function getAllFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Custom Vite plugin that manages service worker versioning and asset manifest generation.
 *
 * This plugin hooks into two Vite build lifecycle events:
 *
 * - **buildStart**: Runs at the start of every build. Generates a unique version string
 *   (base-36 timestamp) and patches it into `static/sw.js` by replacing the
 *   `APP_VERSION` constant. This causes the browser to detect a new service worker
 *   on the next visit, triggering the install/activate lifecycle.
 *
 * - **closeBundle**: Runs after the final bundle is written to disk. Scans
 *   `.svelte-kit/output/client/_app/immutable/` for all JS and CSS assets,
 *   then writes an `asset-manifest.json` to both `static/` (for future dev server use)
 *   and the build output directory (for the current production build). The service worker
 *   can fetch this manifest to know which assets to precache.
 *
 * @returns A Vite plugin object with `name`, `buildStart`, and `closeBundle` hooks.
 */
function serviceWorkerVersion() {
  return {
    name: 'service-worker-version',

    buildStart() {
      // Generate a compact, unique version using base-36 encoding of the current timestamp
      const version = Date.now().toString(36);
      const swPath = resolve('static/sw.js');

      try {
        let swContent = readFileSync(swPath, 'utf-8');
        // Use a regex to find and replace the APP_VERSION constant regardless of its current value
        swContent = swContent.replace(
          /const APP_VERSION = ['"][^'"]*['"]/,
          `const APP_VERSION = '${version}'`
        );
        writeFileSync(swPath, swContent);
        console.log(`[SW] Updated service worker version to: ${version}`);
      } catch (e) {
        console.warn('[SW] Could not update service worker version:', e);
      }
    },

    closeBundle() {
      // SvelteKit places content-hashed (immutable) assets in this directory after build
      const buildDir = resolve('.svelte-kit/output/client/_app/immutable');
      if (!existsSync(buildDir)) {
        console.warn('[SW] Build directory not found, skipping manifest generation');
        return;
      }

      try {
        const allFiles = getAllFiles(buildDir);

        // Convert absolute paths to root-relative paths and keep only JS/CSS bundles
        const assets = allFiles
          .map(f => f.replace(resolve('.svelte-kit/output/client'), ''))
          .filter(f => f.endsWith('.js') || f.endsWith('.css'));

        const manifest = {
          version: Date.now().toString(36),
          assets
        };
        const manifestContent = JSON.stringify(manifest, null, 2);

        // Write to static/ so the dev server and future builds have access to it
        writeFileSync(resolve('static/asset-manifest.json'), manifestContent);

        // Also write directly into the build output, because SvelteKit copies static/
        // files before closeBundle runs, so the static/ copy alone would miss this build
        const buildOutputPath = resolve('.svelte-kit/output/client/asset-manifest.json');
        writeFileSync(buildOutputPath, manifestContent);

        console.log(`[SW] Generated asset manifest with ${assets.length} files`);
      } catch (e) {
        console.warn('[SW] Could not generate asset manifest:', e);
      }
    }
  };
}

export default defineConfig({
  plugins: [
    sveltekit(),            // Core SvelteKit Vite integration (routing, SSR, etc.)
    serviceWorkerVersion()  // Custom plugin: SW version patching + asset manifest
  ],

  build: {
    /**
     * Manual chunk splitting strategy for better long-term caching.
     * By isolating large vendor libraries into their own chunks, app code changes
     * don't invalidate the (much larger) vendor bundles in the browser cache.
     */
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Supabase client - authentication and database SDK (~50KB)
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            // date-fns - date formatting utilities (tree-shakeable but still sizable)
            if (id.includes('date-fns')) {
              return 'vendor-date-fns';
            }
            // Dexie - IndexedDB wrapper used for client-side data persistence
            if (id.includes('dexie')) {
              return 'vendor-dexie';
            }
          }
          // Returning undefined lets Rollup handle the chunk assignment automatically
        }
      }
    },

    /** Warn if any chunk exceeds 500KB (default is 500KB, explicitly set for clarity) */
    chunkSizeWarningLimit: 500,

    /** Use esbuild for minification (faster than terser, good default for most projects) */
    minify: 'esbuild',

    /**
     * Target ES2020 to enable modern syntax like optional chaining, nullish coalescing,
     * and dynamic imports without polyfills, resulting in smaller bundle output.
     */
    target: 'es2020'
  }
});
