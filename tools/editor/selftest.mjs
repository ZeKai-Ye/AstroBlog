/**
 * Self-test for the frontmatter reader/writer. Run with:
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
 */
function fixpoint(original) {
	const first = parseDocument(original);
	const written1 = stringifyDocument(first.data, first.body);
	const second = parseDocument(written1);
	const written2 = stringifyDocument(second.data, second.body);
	return {
		written1,
		written2,
		data: second.data,
		stable: written1 === written2,
	};
}

console.log('\nround-trip every content file');
const files = [...walk(join(root, 'src/content')), join(root, 'src/assets/README.md')];

for (const file of files) {
	const relative = file.replace(root, '').replace(/\\/g, '/');
	const original = readFileSync(file, 'utf8');

	try {
		const result = fixpoint(original);
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

console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures === 0 ? 0 : 1);
