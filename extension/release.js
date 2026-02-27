#!/usr/bin/env node

/**
 * Shortless YouTube — Release Script
 *
 * Bumps the version in package.json and both manifests,
 * then builds and packages zip files for Chrome and Firefox.
 *
 * Usage:
 *   npm run release              # bump patch (1.0.0 -> 1.0.1)
 *   npm run release -- minor     # bump minor (1.0.0 -> 1.1.0)
 *   npm run release -- major     # bump major (1.0.0 -> 2.0.0)
 *   npm run release -- 1.2.3     # set explicit version
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = {
	package: resolve(__dirname, 'package.json'),
	firefox: resolve(__dirname, 'manifests/firefox.json'),
	chrome: resolve(__dirname, 'manifests/chrome.json')
};

function readJSON(path) {
	return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJSON(path, data) {
	writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function bumpVersion(current, type) {
	const [major, minor, patch] = current.split('.').map(Number);
	switch (type) {
		case 'major':
			return `${major + 1}.0.0`;
		case 'minor':
			return `${major}.${minor + 1}.0`;
		case 'patch':
			return `${major}.${minor}.${patch + 1}`;
		default:
			return type;
	}
}

function isValidVersion(v) {
	return /^\d+\.\d+\.\d+$/.test(v);
}

const arg = process.argv[2] || 'patch';

const pkg = readJSON(FILES.package);
const currentVersion = pkg.version;
const newVersion = bumpVersion(currentVersion, arg);

if (!isValidVersion(newVersion)) {
	console.error(`Invalid version: "${newVersion}". Use patch, minor, major, or x.y.z.`);
	process.exit(1);
}

if (newVersion === currentVersion) {
	console.error(`Version is already ${currentVersion}.`);
	process.exit(1);
}

console.log(`\nShortless YouTube Release`);
console.log(`  ${currentVersion} -> ${newVersion}\n`);

// 1. Update package.json
pkg.version = newVersion;
writeJSON(FILES.package, pkg);
console.log(`  Updated package.json`);

// 2. Update manifests
const firefox = readJSON(FILES.firefox);
const chrome = readJSON(FILES.chrome);
firefox.version = newVersion;
chrome.version = newVersion;
writeJSON(FILES.firefox, firefox);
writeJSON(FILES.chrome, chrome);
console.log(`  Updated manifests/firefox.json`);
console.log(`  Updated manifests/chrome.json`);

// 3. Build & package
console.log(`\n  Building & packaging...`);
try {
	execSync('npm run package', { cwd: __dirname, stdio: 'inherit' });
} catch {
	console.error('\n  Build/package failed.');
	process.exit(1);
}

console.log(`\n  Release ${newVersion} ready!`);
console.log(`    shortless-youtube-firefox.zip`);
console.log(`    shortless-youtube-chrome.zip\n`);
