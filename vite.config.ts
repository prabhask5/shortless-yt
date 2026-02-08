import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join } from 'path';

// Recursively get all files in a directory
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

// Plugin to inject build version and generate asset manifest
function serviceWorkerVersion() {
  return {
    name: 'service-worker-version',
    buildStart() {
      // Generate version based on timestamp
      const version = Date.now().toString(36);
      const swPath = resolve('static/sw.js');

      try {
        let swContent = readFileSync(swPath, 'utf-8');
        // Replace the version placeholder
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
      // After build, generate manifest of all immutable assets for precaching
      const buildDir = resolve('.svelte-kit/output/client/_app/immutable');
      if (!existsSync(buildDir)) {
        console.warn('[SW] Build directory not found, skipping manifest generation');
        return;
      }

      try {
        const allFiles = getAllFiles(buildDir);
        const assets = allFiles
          .map(f => f.replace(resolve('.svelte-kit/output/client'), ''))
          .filter(f => f.endsWith('.js') || f.endsWith('.css'));

        const manifest = {
          version: Date.now().toString(36),
          assets
        };
        const manifestContent = JSON.stringify(manifest, null, 2);

        // Write to static folder (for future builds and dev server)
        writeFileSync(resolve('static/asset-manifest.json'), manifestContent);

        // Also write to build output (for current build - static files copied before closeBundle)
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
  plugins: [sveltekit(), serviceWorkerVersion()],
  build: {
    // Optimize chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separate vendor chunks for better caching
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('date-fns')) {
              return 'vendor-date-fns';
            }
            if (id.includes('dexie')) {
              return 'vendor-dexie';
            }
          }
        }
      }
    },
    // Reduce chunk size warnings threshold
    chunkSizeWarningLimit: 500,
    // Enable minification
    minify: 'esbuild',
    // Target modern browsers for smaller bundles
    target: 'es2020'
  }
});
