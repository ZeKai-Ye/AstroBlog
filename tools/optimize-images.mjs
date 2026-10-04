/**
 * Shrinks the pictures the repo carries, so a photo that renders as a 361 KB
 * webp is not stored as a 5.6 MB original that the site never uses.
 *
 *   npm run images              rewrite src/assets (and public/ with --public)
 *   npm run images -- --dry     measure and report, change nothing
 *   npm run images -- --max 2400 --quality 88
 *
 * What it does, per picture over `--min` KB:
 *
 *   1. moves the original to `originals/` (git-ignored, in the same shape);
 *   2. writes the same picture as `.webp`, EXIF rotated, long edge capped;
 *   3. rewrites the references to it in settings and content frontmatter.
 *
 * Step 3 is why this is a script and not a folder of instructions: a rename
 * that misses a reference does not fail silently — `asset()` in src/config.ts
 * throws on a name it cannot resolve — so the build is the check.
 *
 * Already-webp files are re-encoded in place; anything that comes out *larger*
 * than it went in is left alone and reported. Pictures under the size floor are
 * skipped, so a 4 KB author icon is not churned for nothing.
 */
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const BACKUPS = join(root, 'originals');

/** Formats worth re-encoding. GIF is left out: animation would be flattened. */
const CONVERTIBLE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const SOURCES = ['src/assets'];
const REFERENCE_ROOTS = ['src/settings.json', 'src/content'];

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
	const at = argv.findIndex((arg) => arg === `--${name}`);
	if (at === -1) return fallback;
	const value = argv[at + 1];
	return value && !value.startsWith('--') ? value : true;
};

const dry = Boolean(flag('dry', false));
const max = Number(flag('max', 1600));
const quality = Number(flag('quality', 82));
const minKB = Number(flag('min', 100));
const includePublic = Boolean(flag('public', false));

if (includePublic) SOURCES.push('public');

const toPosix = (path) => path.split(sep).join('/');
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const size = (bytes) => (bytes >= 1024 * 1024 ? mb(bytes) : kb(bytes));

async function walk(dir) {
	const found = [];
	if (!existsSync(dir)) return found;
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...(await walk(full)));
		else found.push(full);
	}
	return found;
}

async function collectReferences() {
	const files = [];
	for (const target of REFERENCE_ROOTS) {
		const full = join(root, target);
		if (!existsSync(full)) continue;
		const info = await stat(full);
		if (info.isDirectory()) {
			for (const file of await walk(full)) {
				if (/\.(md|html|json)$/i.test(file)) files.push(file);
			}
		} else {
			files.push(full);
		}
	}
	return files;
}

const done = [];
const skipped = [];
const renames = new Map();

for (const source of SOURCES) {
	for (const file of await walk(join(root, source))) {
		const extension = extname(file).toLowerCase();
		if (!CONVERTIBLE.has(extension)) continue;

		const before = (await stat(file)).size;
		if (before < minKB * 1024) {
			skipped.push([toPosix(relative(root, file)), `${size(before)} — under --min ${minKB} KB`]);
			continue;
		}

		const image = sharp(file, { failOn: 'none' }).rotate();
		const meta = await image.metadata();
		const output = await image
			.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
			.webp({ quality, effort: 5 })
			.toBuffer();

		const target = extension === '.webp' ? file : file.slice(0, -extension.length) + '.webp';
		const label = toPosix(relative(root, file));

		if (output.length >= before) {
			skipped.push([label, `${size(before)} — webp came out bigger (${size(output.length)})`]);
			continue;
		}

		done.push([
			label,
			`${size(before)} -> ${size(output.length)}`,
			`${meta.width}x${meta.height} -> ${max}px cap`,
			toPosix(relative(root, target)),
		]);

		if (target !== file) {
			const from = toPosix(relative(join(root, source), file));
			const to = toPosix(relative(join(root, source), target));
			renames.set(from, to);
		}

		if (dry) continue;

		// The original goes to `originals/` first: this is the only copy.
		const backup = join(BACKUPS, toPosix(relative(root, file)));
		await mkdir(dirname(backup), { recursive: true });
		if (!existsSync(backup)) await rename(file, backup);
		else await unlink(file);
		await writeFile(target, output);
	}
}

console.log(`\n${dry ? 'DRY RUN — nothing written' : 'optimised'}  (max ${max}px, quality ${quality})\n`);

if (done.length) {
	const width = Math.max(...done.map((row) => row[0].length));
	for (const [label, sizes] of done) console.log(`  ${label.padEnd(width)}  ${sizes}`);
	if (dry) {
		const saved = done.length;
		console.log(`\n  ${saved} picture(s) would be rewritten.`);
	}
} else {
	console.log('  nothing to do.');
}

if (skipped.length) {
	console.log('\n  left alone:');
	for (const [label, why] of skipped) console.log(`    ${label} — ${why}`);
}

if (!dry && renames.size) {
	console.log('\n  references rewritten:');
	const files = await collectReferences();
	let edits = 0;

	for (const file of files) {
		const original = await readFile(file, 'utf8');
		let text = original;
		const touched = [];

		for (const [from, to] of renames) {
			const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
			const hits = text.match(pattern);
			if (!hits) continue;
			text = text.replace(pattern, to);
			touched.push(`${from} -> ${to}`);
		}

		if (text === original) continue;
		await writeFile(file, text);
		edits += touched.length;
		console.log(`    ${toPosix(relative(root, file))}: ${touched.join(', ')}`);
	}

	if (!edits) console.log('    none — nothing the pictures were named in');
}

if (!dry && done.length) {
	console.log(`\n  originals kept in ${toPosix(relative(root, BACKUPS))}/ (git-ignored).`);
	console.log('  Check the site, then commit.');
}
