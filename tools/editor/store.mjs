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
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, stringifyDocument } from './frontmatter.mjs';
import { parseHtmlPost, stringifyHtmlPost } from './html-meta.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));

/** The blog collection's two formats — see src/loaders/html-posts.ts. */
const POST_FORMATS = ['.md', '.html'];

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

async function listEntries(dir, extensions = ['.md']) {
	if (!existsSync(dir)) return [];
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			for (const nested of await listEntries(join(dir, entry.name), extensions)) {
				out.push(`${entry.name}/${nested}`);
			}
		} else if (
			entry.name !== 'README.md' &&
			extensions.some((extension) => entry.name.endsWith(extension))
		) {
			out.push(entry.name);
		}
	}
	return out;
}

/** The file behind an id, which a post may spell `.md` or `.html`. */
function fileFor(dir, id, extensions) {
	for (const extension of extensions) {
		const file = join(dir, `${id}${extension}`);
		if (existsSync(file)) return file;
	}
	return null;
}

/**
 * Reads one entry. An unreadable file comes back with `error` set and no
 * `data`, which is the signal for the UI to show it read-only.
 *
 * `format` is the extension without its dot — the UI uses it to decide whether
 * the body is markdown or raw HTML — and `header` is which header syntax the
 * file uses, so saving it back does not convert the file.
 */
async function readEntry(dir, id, extensions = ['.md']) {
	const file = fileFor(dir, id, extensions);
	if (!file) throw new EditorError(`"${id}" does not exist`, 404);

	const text = await readFile(file, 'utf8');
	const format = extname(file).slice(1).toLowerCase();
	const path = relative(root, file).replace(/\\/g, '/');

	try {
		if (format === 'html') {
			const { data, body, style } = parseHtmlPost(text);
			return { id, format, header: style, file: path, data, body };
		}
		const { data, body } = parseDocument(text);
		return { id, format, header: 'yaml', file: path, data, body };
	} catch (error) {
		return { id, format, file: path, error: error.message, raw: text };
	}
}

/** Which header syntax an existing file uses, so a save preserves it. */
function headerStyleOf(file) {
	try {
		return parseHtmlPost(readFileSync(file, 'utf8')).style;
	} catch {
		return 'meta';
	}
}

async function writeEntry(dir, id, data, body, { extensions = ['.md'], format } = {}) {
	const clean = {};
	for (const [key, value] of Object.entries(data ?? {})) {
		if (value === undefined || value === null) continue;
		if (typeof value === 'string' && value.trim() === '' && key !== 'title') continue;
		clean[key] = typeof value === 'string' ? value.trim() : value;
	}

	// An existing file keeps its format and its header syntax; only a new file
	// takes what the caller asked for.
	const existing = fileFor(dir, id, extensions);
	const file = existing ?? join(dir, `${id}${format ? `.${format}` : extensions[0]}`);
	const text =
		extname(file).toLowerCase() === '.html'
			? stringifyHtmlPost(clean, body ?? '', existing ? headerStyleOf(existing) : 'meta')
			: stringifyDocument(clean, body ?? '');

	await writeAtomic(file, text);
	return readEntry(dir, id, extensions);
}

export async function listPosts() {
	const files = await listEntries(PATHS.posts, POST_FORMATS);
	const posts = await Promise.all(
		files.map((name) => readEntry(PATHS.posts, name.replace(/\.[^.]+$/, ''), POST_FORMATS))
	);
	return posts.sort((a, b) => String(b.data?.pubDate ?? '').localeCompare(String(a.data?.pubDate ?? '')));
}

export const readPost = (id) => readEntry(PATHS.posts, assertId(id, 'post id'), POST_FORMATS);

export const writePost = (id, data, body, format) =>
	writeEntry(PATHS.posts, assertId(id, 'post id'), data, body, {
		extensions: POST_FORMATS,
		format: format === 'html' ? 'html' : 'md',
	});

export async function deletePost(id) {
	assertId(id, 'post id');
	const file = fileFor(PATHS.posts, id, POST_FORMATS);
	if (!file) throw new EditorError(`"${id}" does not exist`, 404);
	await rm(file);
}

export async function listAuthors() {
	const ids = await listEntries(PATHS.authors);
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

/* --------------------------------------------------------------- rename --- */

/**
 * Renames an entry's file, which is what its id — and therefore its URL — is.
 *
 * An author's id is also referenced from every post they wrote, so those get
 * rewritten in the same pass; a post's id is not referenced from anywhere, so
 * only the file moves. Nothing here touches the pictures, which are named
 * inside `src/assets/` and are unaffected by a content file's name.
 */
export async function renameEntry(kind, from, to) {
	if (kind !== 'author' && kind !== 'post') {
		throw new EditorError(`cannot rename a "${kind}"`);
	}

	assertId(from, `${kind} id`);
	assertId(to, `${kind} id`);

	const dir = kind === 'author' ? PATHS.authors : PATHS.posts;
	const extensions = kind === 'author' ? ['.md'] : POST_FORMATS;
	const source = fileFor(dir, from, extensions);
	const target = join(dir, `${to}${source ? extname(source) : '.md'}`);

	if (!source) throw new EditorError(`"${from}" does not exist`, 404);
	if (existsSync(target)) throw new EditorError(`"${to}" already exists — pick another name`);

	await rename(source, target);

	const touched = [];
	if (kind === 'author') {
		for (const post of await listPosts()) {
			if (post.data?.author !== from) continue;
			await writeEntry(PATHS.posts, post.id, { ...post.data, author: to }, post.body);
			touched.push(post.id);
		}
	}

	return { kind, from, to, touched };
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
			out.push({
				name: `${prefix}${entry.name}`,
				bytes: info.size,
				modified: info.mtimeMs,
				// A leading `_` holds a file back from the build (see src/config.ts),
				// so the pickers must not offer it.
				held: entry.name.startsWith('_'),
			});
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
