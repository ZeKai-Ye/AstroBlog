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
	/** File names inside `src/assets/`. `''` keeps the design placeholder. */
	images: {
		/** Masthead wordmark picture. `''` falls back to `title` as text. */
		logo: string;
		heroWork: string;
		heroDays: string;
		avatar: string;
	};
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
 *
 * A file whose name starts with `_` is **held back**: it stays in the repo and
 * on disk, but is not bundled, so it never reaches the deployed site. Use it for
 * a photo you have taken but not placed yet. The exclusion has to happen in the
 * pattern rather than as a filter afterwards — `eager: true` means the glob's
 * own imports are what emit the files, so by the time you could filter, the
 * bytes are already in `dist/`.
 */
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'];

const files = import.meta.glob<{ default: ImageMetadata }>(
	[
		'/src/assets/**/*.{jpg,jpeg,png,webp,avif,gif}',
		'/src/assets/**/*.{JPG,JPEG,PNG,WEBP,AVIF,GIF}',
		'!/src/assets/**/_*',
		'!/src/assets/**/_*/**',
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
			'  Names starting with "_" are held back and never bundled.\n' +
			`  Supported extensions: ${EXTENSIONS.join(', ')} (any case).`
	);
};

/**
 * `2026.10.19` — the date form the ledger rows, meta lines and masthead use.
 *
 * Local getters, not `toISOString()`: a post dated 2024-03-03 should read
 * 03.03 everywhere, and the ISO string shifts by a day for anyone east of
 * Greenwich once midnight has passed.
 */
export function formatDateDot(date: Date) {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}.${month}.${day}`;
}

/** `10.19` — the short form the 时日 timeline puts in its left column. */
export function formatMonthDay(date: Date) {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${month}.${day}`;
}

/** `2026-10-19`, for a `<time datetime>` attribute. */
export function isoDate(date: Date) {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A rough reading time for one post, in minutes.
 *
 * CJK prose is read by the character, Latin by the word; 400 characters or 220
 * words a minute are the usual slow-read figures, which suits a site that is
 * deliberately not in a hurry. The body is the raw markdown/HTML source, so
 * markup inflates the count a little — the number is a hint, not a promise.
 */
export function readingMinutes(body?: string) {
	if (!body) return 1;

	const text = body
		.replace(/<[^>]+>/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/```[\s\S]*?```/g, ' ');

	const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
	const words = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;

	return Math.max(1, Math.round(cjk / 400 + words / 220));
}

export const categoryOf = (post: { data: { tags: string[] } }) => post.data.tags[0] ?? '笔记';

/**
 * Copy that is design, not configuration.
 *
 * These strings belong to the page's voice — the hero headline, the volume
 * line, the two tiny mode labels — so they live in one place instead of being
 * scattered through templates. `SITE.title` and `SITE.description` still drive
 * the masthead, the metadata and the search index.
 */
export const UI = {
	/** The Greek phrase the site is named after, set small above the headline. */
	heroGreek: 'Ἔργα καὶ Ἡμέραι',
	/** The headline itself, split for its two lines. */
	heroLines: ['工作，', '与时日。'],
	/** Little subtitle next to the masthead wordmark. */
	brandSub: '工作与时日 / WORK & DAYS',
	/** The volume line in the hero's top corner. */
	volume: 'VOL. 01',
	/** Clock label; the time itself is Asia/Shanghai (see src/scripts/site.ts). */
	timeLabel: '此刻',
};
