/**
 * A content loader for blog posts written as plain HTML.
 *
 * Astro's `glob()` loader picks an entry type by file extension and quietly
 * skips anything it has no type for — `.html` among them — so the markdown
 * loader cannot carry these. This one fills the gap with the parts a post
 * needs: a header, the collection's schema, and the markup stored as the
 * entry's rendered output.
 *
 * The header is a run of `<meta name="…" content="…">` tags at the top of the
 * file — see `META_HEADER` for why that shape and not `---` — though a `---`
 * frontmatter block is still accepted, since that is what markdown posts use
 * and what the first HTML posts were written with.
 *
 * Storing `rendered.html` is what makes `render(entry)` work with no renderer
 * involved: absent `deferredRender`, Astro hands that string straight back as
 * the `<Content />` component. An HTML post is therefore a *fragment* that
 * lands inside the ordinary post page — masthead, date, author card, prev/next
 * — and may use any tag it likes (video, iframe, its own markup, `<style>`,
 * `<script>`) because nothing re-parses or sanitises it.
 *
 * Ids are derived exactly the way the glob loader derives them — github-slugged
 * path segments, `/index` collapsed, `slug:` in frontmatter winning — so
 * `foo.html` and `foo.md` occupy the same URL, and having both is an error
 * rather than a silent last-one-wins.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug as githubSlug } from 'github-slugger';
import { load as parseYaml } from 'js-yaml';
import type { Loader, LoaderContext } from 'astro/loaders';

const EXTENSION = /\.html$/i;

/** Opens on the first line and closes before the markup. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * The `<meta>` header: one void element per field, at the very top of the file.
 *
 *     <meta name="title" content="标题">
 *     <meta name="pubDate" content="2024-03-03">
 *
 * This is the form to prefer for HTML posts, because it is the one an external
 * HTML editor leaves alone. A `---` fence is plain text, so a rich-text editor
 * wraps it in a `<p>` and collapses its newlines; `<meta>` is a real element it
 * recognises, and being void there is no closing tag for auto-complete to
 * insert. Each field also stands alone, so at worst an editor costs you one
 * field rather than the whole header.
 */
const META_HEADER = /^(?:[ \t\r\n]|<meta\b[^>]*>)+/i;
const META_TAG = /<meta\b([^>]*)>/gi;
const ATTRIBUTE = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

/**
 * A real HTML editor will escape what it writes, so undo the handful of
 * entities an attribute value can carry. `&amp;` goes last, or `&amp;quot;`
 * would decode twice.
 */
const ENTITIES: [string, string][] = [
	['&quot;', '"'],
	['&apos;', "'"],
	['&#39;', "'"],
	['&lt;', '<'],
	['&gt;', '>'],
	['&amp;', '&'],
];

const decode = (value: string) =>
	ENTITIES.reduce((text, [entity, character]) => text.split(entity).join(character), value);

/** Every key the blog schema accepts, so a typo is named rather than ignored. */
const HEADER_FIELDS = new Set([
	'title',
	'description',
	'pubDate',
	'updatedDate',
	'tags',
	'cover',
	'coverAlt',
	'author',
	'draft',
	'slug',
]);

function readAttributes(text: string) {
	const attributes: Record<string, string> = {};
	ATTRIBUTE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = ATTRIBUTE.exec(text))) {
		attributes[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
	}
	return attributes;
}

/** A header field is always a string in the file; the schema wants real types. */
function coerceField(name: string, value: string) {
	if (name === 'tags') {
		return value
			.split(/[,，]/)
			.map((tag) => tag.trim())
			.filter(Boolean);
	}
	if (name === 'draft') {
		if (/^(true|yes|1)$/i.test(value.trim())) return true;
		if (/^(false|no|0)$/i.test(value.trim())) return false;
	}
	return value;
}

function parseMetaHeader(source: string, label: string) {
	const block = META_HEADER.exec(source);
	if (!block || !/<meta\b/i.test(block[0])) return null;

	const data: Record<string, unknown> = {};
	let seen = 0;
	META_TAG.lastIndex = 0;
	let tag: RegExpExecArray | null;

	while ((tag = META_TAG.exec(block[0]))) {
		const attributes = readAttributes(tag[1]);
		const name = (attributes.name ?? '').trim();
		if (name === '') continue;
		if (!HEADER_FIELDS.has(name)) {
			throw new Error(
				`${label}: <meta name="${name}"> is not a post field. ` +
					`Use one of: ${[...HEADER_FIELDS].join(', ')}.`
			);
		}
		data[name] = coerceField(name, attributes.content ?? '');
		seen += 1;
	}

	if (seen === 0) return null;
	return { data, body: source.slice(block[0].length).trim() };
}

export interface HtmlPostsOptions {
	/** Directory holding the `.html` posts, relative to the project root. */
	base: string;
}

const toPosix = (path: string) => path.split(sep).join('/');

async function walk(dir: string): Promise<string[]> {
	const found: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...(await walk(full)));
		else if (EXTENSION.test(entry.name)) found.push(full);
	}
	return found;
}

/** A whole document would nest <html> inside the site's own. Say so. */
function assertFragment(body: string, label: string) {
	if (/^<!doctype\s+html|^<html[\s>]/i.test(body)) {
		throw new Error(
			`${label} looks like a complete HTML document. An HTML post is a fragment: ` +
				`drop the <!doctype>, <html>, <head> and <body> wrapper and write only ` +
				`the markup that belongs in the article.`
		);
	}
}

/**
 * Reads whichever header the file carries. `<meta>` wins when both appear,
 * since that is the one the file was told to use.
 */
function splitHeader(source: string, label: string) {
	const meta = parseMetaHeader(source, label);
	if (meta) {
		assertFragment(meta.body, label);
		return meta;
	}

	const match = FRONTMATTER.exec(source);
	if (match) {
		let data: unknown;
		try {
			data = parseYaml(match[1]);
		} catch (error) {
			throw new Error(`${label}: frontmatter is not valid YAML — ${(error as Error).message}`);
		}

		if (data === null || data === undefined) data = {};
		if (typeof data !== 'object' || Array.isArray(data)) {
			throw new Error(`${label}: frontmatter must be a set of \`key: value\` pairs.`);
		}

		const body = source.slice(match[0].length).trim();
		assertFragment(body, label);
		return { data: data as Record<string, unknown>, body };
	}

	// A rich-text editor treats a header as body text: it wraps the block in a
	// <p> and collapses the newlines into spaces. Worth naming, because "no
	// header" alone does not explain where the metadata went.
	const swallowed = /^\s*<(\w+)\b[^>]*>\s*(?:---|<meta\b)/i.exec(source);
	throw new Error(
		`${label} has no header. An HTML post starts with one \`<meta>\` per field, ` +
			`before any markup:\n` +
			`    <meta name="title" content="标题">\n` +
			`    <meta name="pubDate" content="2024-03-03">\n` +
			`  Fields: ${[...HEADER_FIELDS].join(', ')}. ` +
			`A "---" frontmatter block (what markdown posts use) works here too.` +
			(swallowed
				? `\n  This file looks like it came back from a rich-text editor or a WYSIWYG ` +
					`HTML editor: the header ended up inside a <${swallowed[1]}>. Move it back ` +
					`to the very top of the file and delete the tag that swallowed it — ` +
					`otherwise that text shows up in the post.`
				: '')
	);
}

/** Mirrors the glob loader: `slug:` wins, otherwise the slugged relative path. */
function idFor(relativePath: string, data: Record<string, unknown>) {
	if (typeof data.slug === 'string' && data.slug !== '') return data.slug;

	return relativePath
		.replace(EXTENSION, '')
		.split('/')
		.map((segment) => githubSlug(segment))
		.join('/')
		.replace(/\/index$/, '');
}

export function htmlPosts({ base }: HtmlPostsOptions): Loader {
	return {
		name: 'html-posts',
		async load(context: LoaderContext) {
			const { config, logger, store, parseData, generateDigest, watcher } = context;
			const root = fileURLToPath(config.root);
			const dir = join(root, base);
			const idByFile = new Map<string, string>();

			const sync = async (file: string) => {
				const label = toPosix(relative(root, file));
				// Editors on Windows happily save a UTF-8 BOM, which would stop the
				// frontmatter fence from matching at position 0 and report the file as
				// having no frontmatter at all. Astro's markdown path strips it too.
				const source = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
				const { data, body } = splitHeader(source, label);
				const entryId = idFor(toPosix(relative(dir, file)), data);

				// Two files cannot share a URL. Astro does the same check for
				// markdown; without it one post would silently replace another.
				const clash = store.get(entryId);
				if (clash && clash.filePath !== label) {
					throw new Error(
						`Two posts claim the id "${entryId}": ${clash.filePath} and ${label}. ` +
							`Rename one of them, or set \`slug:\` in its frontmatter.`
					);
				}

				const parsed = await parseData({ id: entryId, data, filePath: file });
				store.set({
					id: entryId,
					data: parsed,
					body,
					filePath: label,
					digest: generateDigest(source),
					rendered: { html: body },
				});
				idByFile.set(file, entryId);
			};

			const files = await walk(dir).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== 'ENOENT') throw error;
				logger.warn(`No ${base} directory, so there are no HTML posts.`);
				return [];
			});

			for (const file of files) await sync(file);

			if (!watcher) return;

			// Editing an HTML post should refresh the dev server the way editing
			// markdown does; `load` runs again per sync, as it does for glob().
			const onFile = async (file: string) => {
				if (!EXTENSION.test(file)) return;
				try {
					await sync(file);
					logger.info(`Reloaded data from ${toPosix(relative(root, file))}`);
				} catch (error) {
					logger.error(`Failed to reload ${toPosix(relative(root, file))}: ${(error as Error).message}`);
				}
			};

			watcher.on('add', onFile);
			watcher.on('change', onFile);
			watcher.on('unlink', (file: string) => {
				if (!EXTENSION.test(file)) return;
				const id = idByFile.get(file);
				idByFile.delete(file);
				if (id) store.delete(id);
			});
			watcher.add(dir);
		},
	};
}
