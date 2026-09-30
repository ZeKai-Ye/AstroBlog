import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
 * Markdown files live in `src/content/blog`. The file name becomes the entry id
 * (and therefore the URL: /blog/<id>/), so use lowercase slugs.
 */
const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
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
