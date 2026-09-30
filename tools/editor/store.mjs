/**
 * Everything the editor reads and writes on disk.
 *
 * Kept apart from the HTTP layer so the rules live in one place: which ids are
 * legal, how a file is written, what happens when frontmatter cannot be parsed.
 * Nothing here knows about requests.
 *
 * Safety rules, in order of how much they matter:
 *
 *   - ids are validated against a slug pattern, so a request can never escape
 *     `src/content/` through `../`;
 *   - writes go to a temp file and are renamed into place, so an interrupted
 *     save cannot leave half a file;
 *   - a file whose frontmatter will not parse is reported as unreadable and the
 *     editor refuses to overwrite it rather than round-tripping it into mush.
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, stringifyDocument } from './frontmatter.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));

const PATHS = {
	posts: join(root, 'src/content/blog'),
	authors: join(root, 'src/content/authors'),
	media: join(root, 'src/assets'),
	settings: join(root, 'src/settings.json'),
};

export class EditorError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.status = status;
	}
}

/** Ids become file names and URL segments, so keep them to a safe slug. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);

/** Characters no operating system in play will accept in a file name. */
const ILLEGAL_IN_NAME = /[<>:"|?*\u0000-\u001f\\]/;

export function assertId(id, what = 'id') {
	if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
		throw new EditorError(
			`"${id}" is not a usable ${what}. Use lowercase letters, digits and dashes (e.g. my-first-post).`
		);
	}
	return id;
}

/**
 * Media may live in a sub-folder, so validate every segment individually.
 * Non-ASCII names are fine — people upload `头像.jpg`, and `import.meta.glob`
 * reads them back without complaint.
 */
function assertMediaName(name) {
	if (typeof name !== 'string' || name.trim() === '') {
		throw new EditorError('a file name is required');
	}

	const segments = name.split('/');
	for (const segment of segments) {
		if (segment === '' || segment === '.' || segment === '..') {
			throw new EditorError(`"${name}" is not a usable file name`);
		}
		if (ILLEGAL_IN_NAME.test(segment)) {
			throw new EditorError(`"${name}" contains characters that cannot go in a file name`);
		}
	}

	const leaf = segments[segments.length - 1];
	const dot = leaf.lastIndexOf('.');
	if (dot <= 0 || !IMAGE_EXTENSIONS.has(leaf.slice(dot).toLowerCase())) {
		throw new EditorError(
			`"${name}" is not an image the build can process. Use ${[...IMAGE_EXTENSIONS].join(', ')}.`
		);
	}

	return segments.join('/');
}

export function slugify(input) {
	const base = String(input ?? '')
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return base;
}

async function writeAtomic(file, contents) {
	await mkdir(join(file, '..'), { recursive: true });
	const temp = `${file}.${process.pid}.tmp`;
	await writeFile(temp, contents, 'utf8');
	await rename(temp, file);
}

/* ---------------------------------------------------------------- content --- */

async function listMarkdown(dir) {
	if (!existsSync(dir)) return [];
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			for (const nested of await listMarkdown(join(dir, entry.name))) {
				out.push(`${entry.name}/${nested}`);
			}
		} else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
			out.push(entry.name);
		}
	}
	return out;
}

/**
 * Reads one markdown entry. An unreadable file comes back with `error` set and
 * no `data`, which is the signal for the UI to show it read-only.
 */
async function readEntry(dir, id) {
	const file = join(dir, `${id}.md`);
	const text = await readFile(file, 'utf8');
	try {
		const { data, body } = parseDocument(text);
		return { id, file: relative(root, file).replace(/\\/g, '/'), data, body };
	} catch (error) {
		return {
			id,
			file: relative(root, file).replace(/\\/g, '/'),
			error: error.message,
			raw: text,
		};
	}
}

async function writeEntry(dir, id, data, body) {
	const clean = {};
	for (const [key, value] of Object.entries(data ?? {})) {
		if (value === undefined || value === null) continue;
		if (typeof value === 'string' && value.trim() === '' && key !== 'title') continue;
		clean[key] = typeof value === 'string' ? value.trim() : value;
	}
	await writeAtomic(join(dir, `${id}.md`), stringifyDocument(clean, body ?? ''));
	return readEntry(dir, id);
}

export async function listPosts() {
	const ids = await listMarkdown(PATHS.posts);
	const posts = await Promise.all(ids.map((id) => readEntry(PATHS.posts, id.replace(/\.md$/, ''))));
	return posts.sort((a, b) => String(b.data?.pubDate ?? '').localeCompare(String(a.data?.pubDate ?? '')));
}

export const readPost = (id) => readEntry(PATHS.posts, assertId(id, 'post id'));
export const writePost = (id, data, body) => writeEntry(PATHS.posts, assertId(id, 'post id'), data, body);

export async function deletePost(id) {
	assertId(id, 'post id');
	await rm(join(PATHS.posts, `${id}.md`));
}

export async function listAuthors() {
	const ids = await listMarkdown(PATHS.authors);
	const authors = await Promise.all(
		ids.map((id) => readEntry(PATHS.authors, id.replace(/\.md$/, '')))
	);
	return authors.sort(
		(a, b) => (a.data?.order ?? 100) - (b.data?.order ?? 100) || String(a.data?.name).localeCompare(String(b.data?.name))
	);
}

export const readAuthor = (id) => readEntry(PATHS.authors, assertId(id, 'author id'));
export const writeAuthor = (id, data, body) =>
	writeEntry(PATHS.authors, assertId(id, 'author id'), data, body);

export async function deleteAuthor(id) {
	assertId(id, 'author id');
	await rm(join(PATHS.authors, `${id}.md`));
}

/* --------------------------------------------------------------- settings --- */

export async function readSettings() {
	const text = await readFile(PATHS.settings, 'utf8');
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new EditorError(
			`src/settings.json is not valid JSON — fix it by hand before using the editor. (${error.message})`,
			500
		);
	}
}

export async function writeSettings(settings) {
	if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
		throw new EditorError('settings must be an object');
	}
	await writeAtomic(PATHS.settings, `${JSON.stringify(settings, null, '\t')}\n`);
	return readSettings();
}

/* ------------------------------------------------------------------ media --- */

export async function listMedia() {
	if (!existsSync(PATHS.media)) return [];
	const out = [];

	const walk = async (dir, prefix) => {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				await walk(join(dir, entry.name), `${prefix}${entry.name}/`);
				continue;
			}
			const dot = entry.name.lastIndexOf('.');
			if (dot === -1 || !IMAGE_EXTENSIONS.has(entry.name.slice(dot).toLowerCase())) continue;
			const info = await stat(join(dir, entry.name));
			out.push({ name: `${prefix}${entry.name}`, bytes: info.size, modified: info.mtimeMs });
		}
	};

	await walk(PATHS.media, '');
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** `name` is relative to src/assets/ and may contain a sub-folder. */
export async function saveMedia(name, buffer) {
	const safe = assertMediaName(name);
	const file = join(PATHS.media, safe);
	await mkdir(join(file, '..'), { recursive: true });
	await writeFile(file, buffer);
	return { name: safe, bytes: buffer.length };
}

export async function deleteMedia(name) {
	const safe = assertMediaName(name);
	await rm(join(PATHS.media, safe));
}

export async function readMedia(name) {
	const safe = assertMediaName(name);
	return readFile(join(PATHS.media, safe));
}

/** How many places each media file is referenced from, for a delete warning. */
export async function mediaUsage() {
	const usage = new Map();
	const note = (name) => {
		if (typeof name !== 'string') return;
		const clean = name.trim().replace(/^\.?\//, '');
		if (clean !== '') usage.set(clean, (usage.get(clean) ?? 0) + 1);
	};

	const [settings, posts, authors] = await Promise.all([readSettings(), listPosts(), listAuthors()]);
	for (const value of Object.values(settings.images ?? {})) note(value);
	for (const work of settings.works ?? []) note(work.image);
	for (const post of posts) note(post.data?.cover);
	for (const author of authors) note(author.data?.avatar);

	return usage;
}

export const paths = PATHS;
export { resolve };
