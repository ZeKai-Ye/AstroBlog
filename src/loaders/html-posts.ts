/**
 * A content loader for blog posts written as plain HTML.
 *
 * Astro's `glob()` loader picks an entry type by file extension and quietly
 * skips anything it has no type for — `.html` among them — so the markdown
 * loader cannot carry these. This one fills the gap with the parts a post
 * needs: the same `---` frontmatter block, the collection's schema, and the
 * markup stored as the entry's rendered output.
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

function splitFrontmatter(source: string, label: string) {
	const match = FRONTMATTER.exec(source);
	if (!match) {
		throw new Error(
			`${label} has no frontmatter. An HTML post starts with a "---" block ` +
				`holding at least \`title\` and \`pubDate\`, exactly like a markdown post.`
		);
	}

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

	// A whole document would nest <html> inside the site's own, which browsers
	// paper over in ways that are hard to debug. Say so instead.
	if (/^<!doctype\s+html|^<html[\s>]/i.test(body)) {
		throw new Error(
			`${label} looks like a complete HTML document. An HTML post is a fragment: ` +
				`drop the <!doctype>, <html>, <head> and <body> wrapper and write only ` +
				`the markup that belongs in the article.`
		);
	}

	return { data: data as Record<string, unknown>, body };
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
				const { data, body } = splitFrontmatter(source, label);
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
