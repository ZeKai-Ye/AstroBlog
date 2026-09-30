/**
 * Author lookup.
 *
 * Posts point at an author by id (the file name in `src/content/authors`).
 * Everything that needs "who wrote this" or "list the authors" goes through
 * here so the ordering and the fallback stay in one place.
 */
import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';

export type Author = CollectionEntry<'authors'>;
export type Post = CollectionEntry<'blog'>;

export interface AuthorIndex {
	/** In display order: `order` first, then name. */
	list: Author[];
	byId: Map<string, Author>;
}

export async function getAuthorIndex(): Promise<AuthorIndex> {
	const authors = await getCollection('authors');

	const list = [...authors].sort(
		(a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name, 'zh')
	);

	return { list, byId: new Map(list.map((author) => [author.id, author])) };
}

const warned = new Set<string>();

/**
 * The author of a post. A post that names nobody — or names an id that does not
 * exist — falls back to the first author rather than rendering an empty card.
 */
export function authorOf(index: AuthorIndex, id?: string): Author | undefined {
	if (!id) return index.list[0];

	const hit = index.byId.get(id);
	if (!hit && import.meta.env.DEV && !warned.has(id)) {
		warned.add(id);
		console.warn(
			`[authors] no author "${id}" — known ids: ${[...index.byId.keys()].join(', ') || '(none)'}`
		);
	}
	return hit ?? index.list[0];
}

/** Published posts per author id, counting the fallback the same way. */
export function postCounts(posts: Post[], index: AuthorIndex): Map<string, number> {
	const counts = new Map<string, number>();
	for (const post of posts) {
		const author = authorOf(index, post.data.author);
		if (author) counts.set(author.id, (counts.get(author.id) ?? 0) + 1);
	}
	return counts;
}
