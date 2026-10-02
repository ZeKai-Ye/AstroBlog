/**
 * The header of an HTML post: a run of `<meta name="…" content="…">` tags at
 * the top of the file.
 *
 *     <meta name="title" content="标题">
 *     <meta name="pubDate" content="2024-03-03">
 *     <meta name="tags" content="随笔, 工具">
 *
 * This shape exists because a `---` fence is plain text: an external HTML
 * editor wraps it in a `<p>` and collapses the newlines, and the header is
 * gone. `<meta>` is an element such editors recognise, and being void there is
 * no closing tag for auto-complete to insert.
 *
 * Kept apart from `frontmatter.mjs` rather than folded into it because the two
 * are different syntaxes with different failure modes, and because a post must
 * come back out in the style it went in as — opening and saving a file should
 * never silently convert its header.
 */
import { parseDocument, stringifyDocument } from './frontmatter.mjs';

const META_HEADER = /^(?:[ \t\r\n]|<meta\b[^>]*>)+/i;
const META_TAG = /<meta\b([^>]*)>/gi;
const ATTRIBUTE = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

const ENTITIES = [
	['&quot;', '"'],
	['&apos;', "'"],
	['&#39;', "'"],
	['&lt;', '<'],
	['&gt;', '>'],
	['&amp;', '&'],
];

/** Field order in a written header, so files look the same whoever wrote them. */
const ORDER = [
	'title',
	'pubDate',
	'description',
	'tags',
	'author',
	'draft',
	'updatedDate',
	'cover',
	'coverAlt',
	'slug',
];

const decode = (value) =>
	ENTITIES.reduce((text, [entity, character]) => text.split(entity).join(character), value);

const encode = (value) =>
	String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function readAttributes(text) {
	const attributes = {};
	ATTRIBUTE.lastIndex = 0;
	let match;
	while ((match = ATTRIBUTE.exec(text))) {
		attributes[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
	}
	return attributes;
}

function parseMeta(text) {
	const block = META_HEADER.exec(text);
	if (!block || !/<meta\b/i.test(block[0])) return null;

	const data = {};
	let seen = 0;
	META_TAG.lastIndex = 0;
	let tag;

	while ((tag = META_TAG.exec(block[0]))) {
		const attributes = readAttributes(tag[1]);
		const name = (attributes.name ?? '').trim();
		if (name === '') continue;
		const value = attributes.content ?? '';
		// The schema wants a real list and a real boolean; everything else in a
		// header is text either way.
		if (name === 'tags') data[name] = value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
		else if (name === 'draft') data[name] = /^(true|yes|1)$/i.test(value.trim());
		else data[name] = value;
		seen += 1;
	}

	if (seen === 0) return null;
	return { data, body: text.slice(block[0].length).trimStart(), style: 'meta' };
}

/**
 * Reads an HTML post, whichever header it carries, and reports which one that
 * was so `stringifyHtmlPost` can put it back the same way.
 */
export function parseHtmlPost(text) {
	const clean = text.replace(/^\uFEFF/, '');
	const meta = parseMeta(clean);
	if (meta) return meta;

	const { data, body } = parseDocument(clean);
	return { data, body, style: 'yaml' };
}

function metaLine(name, value) {
	return `<meta name="${name}" content="${encode(value)}">`;
}

export function stringifyHtmlPost(data, body, style = 'meta') {
	if (style === 'yaml') return stringifyDocument(data, body);

	const keys = [
		...ORDER.filter((key) => key in (data ?? {})),
		...Object.keys(data ?? {}).filter((key) => !ORDER.includes(key)),
	];

	const lines = [];
	for (const key of keys) {
		const value = data[key];
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			lines.push(metaLine(key, value.join(', ')));
			continue;
		}
		if (typeof value === 'boolean') {
			lines.push(metaLine(key, value ? 'true' : 'false'));
			continue;
		}
		const text = String(value).trim();
		if (text === '' && key !== 'title') continue;
		lines.push(metaLine(key, text));
	}

	return `${lines.join('\n')}\n\n${body ?? ''}`;
}
