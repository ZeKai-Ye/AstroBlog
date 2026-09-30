/**
 * Typed access to the site's settings, plus the small helpers the templates use.
 *
 * The values themselves live in `src/settings.json` so the local editor
 * (`npm run dev`, then http://localhost:4321/__edit) can read and write them —
 * configuration a tool edits should be data, not TypeScript source. Anything
 * that is structure rather than content (routes, the shape of a nav entry)
 * stays here.
 */
import type { ImageMetadata } from 'astro';
import settings from './settings.json';

export interface NavItem {
	href: string;
	zh: string;
	greek: string;
}

export interface WorkItem {
	title: string;
	meta: string;
	image: string;
}

export interface SiteSettings {
	title: string;
	description: string;
	lang: string;
	footerNote: string;
	author: { name: string; bio: string };
	nav: NavItem[];
	features: NavItem[];
	/** File names inside `src/assets/`. `''` keeps the design placeholder. */
	images: { heroWork: string; heroDays: string; avatar: string };
	works: WorkItem[];
}

export const SITE: SiteSettings = settings;

/**
 * Prefixes a root-relative path with Astro's configured `base`.
 *
 * Astro rewrites the asset URLs it generates itself, but not `href`s written by
 * hand in a template. Deploying at the domain root (the default) makes this a
 * no-op; it only matters if `BASE_PATH` is ever set.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

export const withBase = (path: string) => {
	const normalised = path.startsWith('/') ? path : `/${path}`;
	return `${BASE}${normalised}` || '/';
};

/**
 * Resolves a file name to an image.
 *
 * Drop a photo into `src/assets/` — sub-folders are fine — and write its name
 * relative to that folder in `settings.json`. Everything there is picked up at
 * build time, so there is no import to add; Astro then resizes and compresses it
 * once per slot it is used in.
 *
 * Two things this deliberately does:
 *
 *   - matches the extension case-insensitively, because Windows hands you
 *     `IMG_1234.JPG` far more often than `img_1234.jpg`;
 *   - **throws** when a configured name resolves to nothing, instead of quietly
 *     drawing the placeholder. A configured-but-missing picture is always a
 *     typo, and a silent fallback is how you end up staring at an empty slot
 *     wondering why nothing happened.
 */
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'];

const files = import.meta.glob<{ default: ImageMetadata }>(
	[
		'/src/assets/**/*.{jpg,jpeg,png,webp,avif,gif}',
		'/src/assets/**/*.{JPG,JPEG,PNG,WEBP,AVIF,GIF}',
	],
	{ eager: true }
);

/** Keyed by the name as written in settings.json, lower-cased for lookup. */
const byName = new Map<string, { src: ImageMetadata; label: string }>();

for (const [path, mod] of Object.entries(files)) {
	const label = path.replace('/src/assets/', '');
	byName.set(label.toLowerCase(), { src: mod.default, label });
}

export const asset = (name?: string): ImageMetadata | undefined => {
	if (!name) return undefined;

	const wanted = name.replace(/^\.?\//, '').toLowerCase();
	const hit = byName.get(wanted);
	if (hit) return hit.src;

	const available = [...byName.values()].map((entry) => entry.label).sort();
	throw new Error(
		`[assets] settings.json points at "${name}", but there is no such file in src/assets/.\n` +
			(available.length
				? `  In there: ${available.join(', ')}\n`
				: '  src/assets/ has no images in it yet.\n') +
			`  Supported extensions: ${EXTENSIONS.join(', ')} (any case).`
	);
};

/** Splits a date into the three stacked lines the design puts beside a title. */
export function formatDateParts(date: Date) {
	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December',
	];
	return {
		year: String(date.getFullYear()),
		month: monthNames[date.getMonth()],
		day: String(date.getDate()).padStart(2, '0'),
		iso: date.toISOString().slice(0, 10),
	};
}
