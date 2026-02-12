#!/usr/bin/env node

/**
 * PWA Icon Generator Script
 *
 * Generates SVG placeholder icons for the Progressive Web App manifest.
 * Each icon is a simplified YouTube-style play button (red rounded rectangle
 * with a white triangle) rendered as an SVG at the required PWA icon sizes.
 *
 * Two icon variants are produced:
 *   - **Standard icons**: Transparent background, used for browser tabs and desktop shortcuts
 *   - **Maskable icons**: Include a dark background with 10% safe-zone padding, used by
 *     Android adaptive icons and other platforms that may crop the icon into circles/shapes
 *
 * Output directory: static/icons/
 *
 * Note: These are SVG files saved with .svg extensions. For production-quality PNG icons,
 * use a rasterization tool like `sharp` or `pwa-asset-generator`.
 *
 * Usage: node scripts/generate-icons.js
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname equivalent for ES modules (import.meta.url gives the file:// URL of this script)
const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'static', 'icons');

// Ensure the output directory exists (recursive: true creates parent dirs too)
if (!existsSync(iconsDir)) {
	mkdirSync(iconsDir, { recursive: true });
}

/**
 * Creates an SVG string for a PWA icon at the given size.
 *
 * The icon consists of a red rounded rectangle (the "YouTube" container)
 * with a white triangular play button centered inside it.
 *
 * @param {number}  size     - The width and height of the icon in pixels.
 * @param {boolean} maskable - If true, adds a dark background and 10% padding
 *                             to comply with the PWA maskable icon safe zone.
 *                             @see https://web.dev/maskable-icon/
 * @returns {string} The complete SVG markup as a string.
 */
function createSvgIcon(size, maskable = false) {
	// Maskable icons need 10% padding on all sides for the "safe zone"
	const padding = maskable ? size * 0.1 : 0;
	const innerSize = size - padding * 2;

	// Red rounded rectangle dimensions (70% width, 50% height of available space)
	const rectW = innerSize * 0.7;
	const rectH = innerSize * 0.5;
	// Center the rectangle within the available area
	const rectX = padding + (innerSize - rectW) / 2;
	const rectY = padding + (innerSize - rectH) / 2;
	// Corner radius proportional to the rectangle height
	const rx = rectH * 0.2;

	// Triangle play button vertices - positioned inside the red rectangle
	// Slightly right-of-center to create visual balance (play buttons look centered
	// when shifted right because the triangle's visual weight is on the left)
	const triX1 = rectX + rectW * 0.35;   // Left point (top)
	const triY1 = rectY + rectH * 0.2;
	const triX2 = triX1;                   // Left point (bottom)
	const triY2 = rectY + rectH * 0.8;
	const triX3 = rectX + rectW * 0.75;   // Right point (middle)
	const triY3 = rectY + rectH * 0.5;

	// Maskable icons get a solid dark background; standard icons are transparent
	const bg = maskable
		? `<rect width="${size}" height="${size}" fill="#0f0f0f"/>`
		: '';

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${bg}
<rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="${rx}" fill="#ff0000"/>
<polygon points="${triX1},${triY1} ${triX2},${triY2} ${triX3},${triY3}" fill="white"/>
</svg>`;
}

/**
 * Icon size definitions for the PWA manifest.
 *
 * - 192px & 512px: Required by the Web App Manifest spec for Android/Chrome
 * - Maskable variants: Used by Android adaptive icons that crop to circles/rounded shapes
 * - Apple touch icons (180, 152, 120): Required sizes for iOS home screen shortcuts
 *   (180 = iPhone retina, 152 = iPad retina, 120 = iPhone non-retina)
 */
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
	// Save as .svg (rename from the .png naming convention used in the manifest).
	// Browsers accept SVG data for icons, so these work for development.
	// For actual PNG conversion, use a rasterization tool like sharp or canvas.
	const svgName = name.replace('.png', '.svg');
	writeFileSync(join(iconsDir, svgName), svg);
	console.log(`Created ${svgName}`);
}

// Inform the developer about the PNG conversion step for production
console.log('\\nNote: Created SVG icons. For proper PNG icons, run:');
console.log('npx pwa-asset-generator static/favicon.svg static/icons');
