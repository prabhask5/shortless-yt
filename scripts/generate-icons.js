#!/usr/bin/env node

/**
 * Generate PWA icons from the SVG favicon.
 *
 * This creates simple PNG placeholder icons. For production,
 * replace these with properly designed icons.
 *
 * Usage: node scripts/generate-icons.js
 *
 * Note: This creates SVG-based "icons" that work for development.
 * For proper PNG icons, use a tool like sharp or an online PWA icon generator.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'static', 'icons');

if (!existsSync(iconsDir)) {
	mkdirSync(iconsDir, { recursive: true });
}

function createSvgIcon(size, maskable = false) {
	const padding = maskable ? size * 0.1 : 0;
	const innerSize = size - padding * 2;
	const rectW = innerSize * 0.7;
	const rectH = innerSize * 0.5;
	const rectX = padding + (innerSize - rectW) / 2;
	const rectY = padding + (innerSize - rectH) / 2;
	const rx = rectH * 0.2;

	// Triangle play button
	const triX1 = rectX + rectW * 0.35;
	const triY1 = rectY + rectH * 0.2;
	const triX2 = triX1;
	const triY2 = rectY + rectH * 0.8;
	const triX3 = rectX + rectW * 0.75;
	const triY3 = rectY + rectH * 0.5;

	const bg = maskable
		? `<rect width="${size}" height="${size}" fill="#0f0f0f"/>`
		: '';

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${bg}
<rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="${rx}" fill="#ff0000"/>
<polygon points="${triX1},${triY1} ${triX2},${triY2} ${triX3},${triY3}" fill="white"/>
</svg>`;
}

const sizes = [
	{ name: 'icon-192.png', size: 192, maskable: false },
	{ name: 'icon-512.png', size: 512, maskable: false },
	{ name: 'icon-maskable-192.png', size: 192, maskable: true },
	{ name: 'icon-maskable-512.png', size: 512, maskable: true },
	{ name: 'apple-touch-icon-180.png', size: 180, maskable: true },
	{ name: 'apple-touch-icon-152.png', size: 152, maskable: true },
	{ name: 'apple-touch-icon-120.png', size: 120, maskable: true },
];

for (const { name, size, maskable } of sizes) {
	const svg = createSvgIcon(size, maskable);
	// Save as SVG with .png extension for now (browsers accept SVG data)
	// For actual PNG conversion, use sharp or canvas
	const svgName = name.replace('.png', '.svg');
	writeFileSync(join(iconsDir, svgName), svg);
	console.log(`Created ${svgName}`);
}

// Also create simple PNG-like placeholders using data URIs approach
// For proper PNGs, use: npx pwa-asset-generator static/favicon.svg static/icons
console.log('\\nNote: Created SVG icons. For proper PNG icons, run:');
console.log('npx pwa-asset-generator static/favicon.svg static/icons');
