import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { htmlPosts } from './loaders/html-posts';

/**
 * 作者 — the people who write here.
 *
 * Markdown files live in `src/content/authors`. The file name becomes the entry
 * id (and the URL: /authors/<id>/), so use lowercase slugs. A `## 标题` heading
 * in the body shows up as a section on the author's page.
 */
const authors = defineCollection({
	loader: glob({ base: './src/content/authors', pattern: '**/*.md' }),
	schema: z.object({
		name: z.string(),
		/** One line. Goes on the cards and under the name on a post. */
		bio: z.string().default(''),
		/** Anything else shown under it — role, location, whatever. */
		role: z.string().default(''),
		/**
		 * File name inside `src/assets/`, e.g. `shen-yan.jpg`. Every picture on
		 * the site lives in that one folder; see `asset()` in src/config.ts.
		 */
		avatar: z.string().default(''),
		links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
		/** Lower sorts first in 作者一览; ties fall back to name. */
		order: z.number().default(100),
	}),
});

/**
 * 时日 / Ἡμέραι — the blog.
 *
 * Posts live in `src/content/blog` and come in two formats, both carrying the
 * same `---` frontmatter and both producing the same page:
 *
 *   - `.md`   — markdown, rendered by Astro as usual
 *   - `.html` — a fragment of plain HTML, injected as-is
 *
 * The file name becomes the entry id (and therefore the URL: /blog/<id>/), so
 * use lowercase slugs. 用 HTML 写是为了能直接放 markdown 表达不了的东西：
 * `<video>` / `<audio>` / `<iframe>`、自定义结构、自己的 `<style>` 和
 * `<script>`。代价是它不经过 Astro 的图片管线，所以里面的媒体文件放在
 * `public/` 下、用普通路径引用。
 *
 * `glob()` can only see its own entry types and skips everything else, so the
 * two formats are loaded by two loaders composed into one collection. That way
 * every consumer keeps calling `getCollection('blog')` and never learns that
 * markdown and HTML are handled differently.
 *
 * The order matters. `glob()` deletes every entry it registered last time that
 * it did not match this time — which includes the previous run's HTML entries.
 * Running it first, then registering the HTML posts, means the duplicate-id
 * check in the HTML loader sees a genuine clash (`foo.md` + `foo.html`) rather
 * than its own entry from the last sync.
 */
const blog = defineCollection({
	loader: {
		name: 'blog',
		async load(context) {
			await glob({ base: './src/content/blog', pattern: '**/*.md' }).load(context);
			await htmlPosts({ base: './src/content/blog' }).load(context);
		},
	},
	schema: z.object({
		title: z.string(),
		description: z.string().default(''),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		/** Free-form labels; shown as a meta row under the title. */
		tags: z.array(z.string()).default([]),
		/** File name inside `src/assets/`; empty keeps the design's image slot. */
		cover: z.string().default(''),
		coverAlt: z.string().default(''),
		/**
		 * Author id — the file name in `src/content/authors`.
		 * Leave it off and the post falls to the first author.
		 */
		author: z.string().optional(),
		/** Drafts are excluded from every index and from the RSS-less build. */
		draft: z.boolean().default(false),
	}),
});

export const collections = { authors, blog };
