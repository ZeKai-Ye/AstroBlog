import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 时日 / Ἡμέραι — the blog.
 *
 * Markdown files live in `src/content/blog`. The file name becomes the entry id
 * (and therefore the URL: /blog/<id>/), so use lowercase slugs.
 */
const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string().default(''),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			/** Free-form labels; shown as a meta row under the title. */
			tags: z.array(z.string()).default([]),
			/** Optional lead image; falls back to the design's image slot. */
			cover: image().optional(),
			coverAlt: z.string().optional(),
			/** Drafts are excluded from every index and from the RSS-less build. */
			draft: z.boolean().default(false),
		}),
});

export const collections = { blog };
