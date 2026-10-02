/**
 * Self-test for the header readers/writers. Run with:
 *
 *   node tools/editor/selftest.mjs
 *
 * It round-trips every real content file in the repo and then hammers the edge
 * cases the editor has to survive. Exit code 1 on any failure.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, stringifyDocument } from './frontmatter.mjs';
import { parseHtmlPost, stringifyHtmlPost } from './html-meta.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

let failures = 0;
let checks = 0;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function check(name, condition, detail = '') {
	checks++;
	if (condition) {
		console.log(`  ok   ${name}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
	}
}

function walk(dir) {
	const out = [];
	// Both blog formats go through the editor's own parser, so both need to
	// survive a save unchanged.
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else if (/\.(md|html)$/.test(entry) && entry !== 'README.md') out.push(full);
	}
	return out;
}

/**
 * Writing drops empty values on purpose (`tags: []`, `description:`), so the
 * property worth asserting is not "identity" but "fixpoint": once written, a
 * file must stay byte-identical through any number of further saves. That is
 * what stops the editor from churning a file every time it is opened.
 *
 * Each format is read and written with its own reader, and written back in the
 * header syntax it arrived with — a save must never convert a file.
 */
function fixpoint(original, format = 'md') {
	const read = format === 'html' ? parseHtmlPost : (text) => ({ ...parseDocument(text), style: 'yaml' });
	const write = (data, body, style) =>
		format === 'html' ? stringifyHtmlPost(data, body, style) : stringifyDocument(data, body);

	const first = read(original);
	const written1 = write(first.data, first.body, first.style);
	const second = read(written1);
	const written2 = write(second.data, second.body, second.style);
	return {
		written1,
		written2,
		data: second.data,
		style: first.style,
		stable: written1 === written2,
	};
}

console.log('\nround-trip every content file');
const files = [...walk(join(root, 'src/content')), join(root, 'src/assets/README.md')];

for (const file of files) {
	const relative = file.replace(root, '').replace(/\\/g, '/');
	const original = readFileSync(file, 'utf8');
	const format = file.endsWith('.html') ? 'html' : 'md';

	try {
		const result = fixpoint(original, format);
		check(
			`${relative} (${Object.keys(result.data).length} keys)`,
			result.stable,
			`first write:\n${result.written1}\n       second write:\n${result.written2}`
		);
	} catch (error) {
		check(relative, false, error.message);
	}
}

console.log('\nshapes');
const shapes = {
	'plain and quoted': 'title: 关于慢工具\nslug: "a: b"\nnote: \'it\'\'s fine\'\n',
	'numbers and booleans': 'order: 2\nratio: 1.5\ndraft: false\nlive: true\n',
	'dates stay strings': 'pubDate: 2024-09-07\nupdatedDate: 2025-01-02\n',
	'flow list': "tags: ['工具', '随笔']\n",
	'block list': 'tags:\n  - 工具\n  - 随笔\n',
	'list of objects': 'links:\n  - label: 邮箱\n    href: mailto:a@b.com\n  - label: GitHub\n    href: https://github.com/\n',
	'colon in value': 'href: https://example.com/a:b\n',
	'hash inside quotes': 'title: "a # b"\n',
	'value needing quotes': 'title: "true"\nother: "2024-01-01"\n',
};

for (const [name, source] of Object.entries(shapes)) {
	try {
		const result = fixpoint(`---\n${source}---\n\nbody\n`);
		check(name, result.stable && same(parseDocument(source ? `---\n${source}---\n` : '').data, result.data), JSON.stringify(result.data));
	} catch (error) {
		check(name, false, error.message);
	}
}

console.log('\ndeliberately dropped on write');
{
	const once = parseDocument('---\ntitle: x\nempty: []\nblank:\n---\n\nbody\n');
	const text = stringifyDocument(once.data, once.body);
	check('empty list and null value are dropped', !text.includes('empty') && !text.includes('blank'), text);
	check('the surviving field is kept', text.includes('title: x'), text);
}

console.log('\nspecific values');
{
	const { data } = parseDocument(
		'---\ntags: [\'工具\', \'随笔\']\nlinks:\n  - label: 邮箱\n    href: mailto:a@b.com\npubDate: 2024-09-07\ndraft: false\norder: 3\n---\n\nbody\n'
	);
	check('tags parsed', same(data.tags, ['工具', '随笔']), JSON.stringify(data.tags));
	check('links parsed', same(data.links, [{ label: '邮箱', href: 'mailto:a@b.com' }]), JSON.stringify(data.links));
	check('date kept as string', data.pubDate === '2024-09-07', JSON.stringify(data.pubDate));
	check('boolean parsed', data.draft === false, JSON.stringify(data.draft));
	check('number parsed', data.order === 3, JSON.stringify(data.order));
}

console.log('\nbodies');
{
	const { body } = parseDocument('---\ntitle: x\n---\n\nline one\n\n## head\n\ntext\n');
	check('body preserved', body === 'line one\n\n## head\n\ntext\n', JSON.stringify(body));
	const noFm = parseDocument('# just markdown\n');
	check('no frontmatter tolerated', noFm.body === '# just markdown\n' && same(noFm.data, {}));
}

console.log('\nrejects what it cannot read');
for (const [name, source] of Object.entries({
	'unclosed frontmatter': '---\ntitle: x\n\nbody\n',
	'tab indent': '---\ntags:\n\t- a\n---\n',
	'not an entry': '---\njust some text\n---\n',
	'unterminated quote': '---\ntitle: "oops\n---\n',
})) {
	let threw = false;
	try {
		parseDocument(source);
	} catch {
		threw = true;
	}
	check(name, threw);
}

console.log('\nthe <meta> header html posts use');
{
	const source =
		'<meta name="title" content="标题">\n' +
		'<meta name="pubDate" content="2024-03-03">\n' +
		'<meta name="tags" content="随笔, 工具">\n' +
		'<meta name="draft" content="false">\n' +
		'\n<p>正文</p>\n';

	const parsed = parseHtmlPost(source);
	check('header read as meta', parsed.style === 'meta', parsed.style);
	check('title read', parsed.data.title === '标题', JSON.stringify(parsed.data.title));
	check('tags split on both commas', same(parsed.data.tags, ['随笔', '工具']), JSON.stringify(parsed.data.tags));
	check('draft read as boolean', parsed.data.draft === false, JSON.stringify(parsed.data.draft));
	check('body is only the markup', parsed.body === '<p>正文</p>\n', JSON.stringify(parsed.body));

	const rewritten = parseHtmlPost(stringifyHtmlPost(parsed.data, parsed.body, 'meta'));
	check('meta header round-trips', same(rewritten.data, parsed.data) && rewritten.style === 'meta');

	// The whole point of the shape: a header that came back wrapped in a <p>
	// must not be mistaken for a header at all.
	const squashed = parseHtmlPost('<p>--- title: x ---</p>\n<p>body</p>\n');
	check('squashed header is not read as meta', squashed.style === 'yaml');

	const withQuote = { title: '他说 "你好" & 再见', pubDate: '2024-03-03' };
	const escaped = stringifyHtmlPost(withQuote, '<p>x</p>');
	check('quotes and ampersands survive', same(parseHtmlPost(escaped).data, withQuote), escaped);
	check('escaping keeps the tag parseable', escaped.split('\n')[0].endsWith('">'), escaped.split('\n')[0]);

	const old = '<meta name="title" content="旧">\n\n<p>正文</p>\n';
	const converted = parseHtmlPost(old);
	check('meta file keeps meta style', converted.style === 'meta');
	const yamlFile = '---\ntitle: 旧\n---\n\n<p>x</p>\n';
	check('a "---" html post stays yaml', parseHtmlPost(yamlFile).style === 'yaml');
}

console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures === 0 ? 0 : 1);
