/**
 * Shortless YouTube — Build Script
 * Assembles dist-chrome/ and dist-firefox/ from src/ files + browser-specific manifests.
 *
 * Since the extension uses plain JavaScript (no TypeScript, no bundling needed),
 * this script simply copies source files and the correct manifest into each
 * dist directory.
 *
 * Usage:
 *   node build.js           — Build for all targets (Chrome + Firefox)
 *   node build.js firefox   — Build for Firefox only
 *   node build.js chrome    — Build for Chrome only
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse CLI args
const args = process.argv.slice(2);
const targetArg = args[0]?.toLowerCase();

const targets = [];
if (!targetArg || targetArg === 'all') {
  targets.push('firefox', 'chrome');
} else if (targetArg === 'firefox' || targetArg === 'chrome') {
  targets.push(targetArg);
} else {
  console.error(`Unknown target: ${targetArg}`);
  console.error('Usage: node build.js [firefox|chrome|all]');
  process.exit(1);
}

// Directories
const srcDir = join(__dirname, 'src');
const manifestsDir = join(__dirname, 'manifests');
const iconsDir = join(__dirname, 'icons');

// Build configuration per target
const targetConfig = {
  firefox: {
    distDir: join(__dirname, 'dist-firefox'),
    manifestFile: 'firefox.json',
  },
  chrome: {
    distDir: join(__dirname, 'dist-chrome'),
    manifestFile: 'chrome.json',
  },
};

// Source files to copy into each dist folder
const filesToCopy = [
  'shortless.css',
  'shortless.js',
  'background.js',
  'rules.json',
];

// Icon files to copy
const iconFiles = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'];

function buildTarget(target) {
  const config = targetConfig[target];
  const { distDir, manifestFile } = config;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Building for ${target.toUpperCase()}...`);
  console.log(`${'='.repeat(50)}`);

  // Ensure dist directories exist
  const dirs = [distDir, join(distDir, 'icons')];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // Copy source files
  console.log('  Copying source files...');
  for (const file of filesToCopy) {
    const srcPath = join(srcDir, file);
    const destPath = join(distDir, file);
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      console.log(`    Copied: ${file}`);
    } else {
      console.warn(`    Warning: Source file not found: ${srcPath}`);
    }
  }

  // Copy manifest
  const manifestSrc = join(manifestsDir, manifestFile);
  const manifestDest = join(distDir, 'manifest.json');
  if (existsSync(manifestSrc)) {
    copyFileSync(manifestSrc, manifestDest);
    console.log(`    Copied: manifest.json (from ${manifestFile})`);
  } else {
    console.error(`    Error: Manifest not found: ${manifestSrc}`);
    process.exit(1);
  }

  // Copy icons
  console.log('  Copying icons...');
  for (const icon of iconFiles) {
    const iconSrc = join(iconsDir, icon);
    const iconDest = join(distDir, 'icons', icon);
    if (existsSync(iconSrc)) {
      copyFileSync(iconSrc, iconDest);
      console.log(`    Copied: icons/${icon}`);
    } else {
      console.warn(`    Warning: Icon not found: ${iconSrc}`);
    }
  }

  console.log(`  Done: ${target}`);
}

// Main
console.log('Shortless YouTube Builder');
console.log(`Targets: ${targets.join(', ')}`);

for (const target of targets) {
  buildTarget(target);
}

console.log(`\n${'='.repeat(50)}`);
console.log('All builds complete!');
console.log(`${'='.repeat(50)}`);

for (const target of targets) {
  console.log(`  ${target}: ${targetConfig[target].distDir}`);
}
