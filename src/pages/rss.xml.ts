import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE, absoluteUrl } from '../config';

/**
 * `/rss.xml` — the whole 时日 feed, built from the same collection the pages
 * use. No dependency: an RSS feed is a few hundred bytes of XML, and the
 * build already knows every post.
 */

const escapeXml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

export const GET: APIRoute = async () => {
	const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
	);

	const items = posts
		.map((post) => {
			const link = absoluteUrl(`/blog/${post.id}/`);
			return [
				'    <item>',
				`      <title>${escapeXml(post.data.title)}</title>`,
				`      <link>${link}</link>`,
				`      <guid isPermaLink="true">${link}</guid>`,
				`      <pubDate>${post.data.pubDate.toUTCString()}</pubDate>`,
				`      <description>${escapeXml(post.data.description)}</description>`,
				'    </item>',
			].join('\n');
		})
		.join('\n');

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.title)}</title>
    <link>${absoluteUrl('/')}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>${SITE.lang}</language>
    <atom:link href="${absoluteUrl('/rss.xml')}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

	return new Response(body, {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
	});
};
