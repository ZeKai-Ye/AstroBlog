import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getAuthorIndex } from '../authors';
import { absoluteUrl } from '../config';

/**
 * `/sitemap.xml` — the static pages, every published post and every author.
 *
 * Drafts are left out because no other index links them. `lastmod` comes from
 * the post's own dates, so a feed reader or crawler sees real change times
 * instead of the build time.
 */

interface UrlEntry {
	loc: string;
	lastmod?: string;
}

export const GET: APIRoute = async () => {
	const posts = await getCollection('blog', ({ data }) => !data.draft);
	const authors = await getAuthorIndex();

	const urls: UrlEntry[] = [
		{ loc: absoluteUrl('/') },
		{ loc: absoluteUrl('/blog/') },
		{ loc: absoluteUrl('/works/') },
		{ loc: absoluteUrl('/about/') },
		{ loc: absoluteUrl('/search/') },
		...posts.map((post) => ({
			loc: absoluteUrl(`/blog/${post.id}/`),
			lastmod: (post.data.updatedDate ?? post.data.pubDate).toISOString(),
		})),
		...authors.list.map((author) => ({ loc: absoluteUrl(`/authors/${author.id}/`) })),
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map((entry) =>
		[
			'  <url>',
			`    <loc>${entry.loc}</loc>`,
			entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
			'  </url>',
		]
			.filter(Boolean)
			.join('\n')
	)
	.join('\n')}
</urlset>
`;

	return new Response(body, {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' },
	});
};
