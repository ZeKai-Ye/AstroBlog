/**
 * A small YAML reader/writer, scoped to the frontmatter this site actually uses.
 *
 * Why not a real YAML library: the only one resolvable here is a transitive
 * dependency of Astro, and declaring it rewrites ~90 lockfile entries, which is
 * a lot of churn to carry for a local editing tool. What the content collections
 * declare is narrow — strings, numbers, booleans, ISO dates, arrays of scalars
 * and arrays of flat objects — so this handles exactly that.
 *
 * It is deliberately strict. Anything it does not recognise throws, and the
 * editor treats a throw as "hands off": it will show the file but refuse to
 * write it back, so an exotic edit can never be silently mangled.
 */

const SCALAR_TRUE = new Set(['true', 'yes', 'on']);
const SCALAR_FALSE = new Set(['false', 'no', 'off']);
const SCALAR_NULL = new Set(['null', '~', '']);

/** Splits `a, 'b,c', "d"` on the commas that are not inside quotes or brackets. */
function splitFlow(text) {
	const parts = [];
	let depth = 0;
	let quote = null;
	let current = '';

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];

		if (quote) {
			current += ch;
			if (quote === '"' && ch === '\\') {
				current += text[++i] ?? '';
			} else if (ch === quote) {
				if (quote === "'" && text[i + 1] === "'") current += text[++i];
				else quote = null;
			}
			continue;
		}

		if (ch === '"' || ch === "'") {
			quote = ch;
			current += ch;
		} else if (ch === '[' || ch === '{') {
			depth++;
			current += ch;
		} else if (ch === ']' || ch === '}') {
			depth--;
			current += ch;
		} else if (ch === ',' && depth === 0) {
			parts.push(current);
			current = '';
		} else {
			current += ch;
		}
	}

	parts.push(current);
	return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/** Drops a trailing ` # comment` from a plain scalar, per YAML's rule. */
function stripComment(text) {
	const at = text.search(/\s#/);
	return at === -1 ? text : text.slice(0, at).trimEnd();
}

function parseScalar(raw) {
	let text = raw.trim();
	if (text === '') return null;

	if (text.startsWith('"')) {
		if (!text.endsWith('"') || text.length < 2) {
			throw new Error(`unterminated double-quoted string: ${raw}`);
		}
		try {
			return JSON.parse(text);
		} catch {
			throw new Error(`cannot read double-quoted string: ${raw}`);
		}
	}

	if (text.startsWith("'")) {
		if (!text.endsWith("'") || text.length < 2) {
			throw new Error(`unterminated single-quoted string: ${raw}`);
		}
		return text.slice(1, -1).replace(/''/g, "'");
	}

	text = stripComment(text);
	if (text === '') return null;

	if (text.startsWith('[')) {
		if (!text.endsWith(']')) throw new Error(`unterminated list: ${raw}`);
		return splitFlow(text.slice(1, -1)).map(parseScalar);
	}

	if (text.startsWith('{')) {
		if (!text.endsWith('}')) throw new Error(`unterminated map: ${raw}`);
		const out = {};
		for (const pair of splitFlow(text.slice(1, -1))) {
			const colon = pair.indexOf(':');
			if (colon === -1) throw new Error(`expected key: value in ${pair}`);
			out[pair.slice(0, colon).trim()] = parseScalar(pair.slice(colon + 1));
		}
		return out;
	}

	const lower = text.toLowerCase();
	if (SCALAR_NULL.has(lower)) return null;
	if (SCALAR_TRUE.has(lower)) return true;
	if (SCALAR_FALSE.has(lower)) return false;
	if (/^[-+]?\d+(\.\d+)?$/.test(text)) return Number(text);

	// Dates stay strings: the schemas run them through z.coerce.date() anyway.
	return text;
}

function tokenise(lines) {
	const tokens = [];
	lines.forEach((raw, index) => {
		if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) return;
		if (/^\t/.test(raw)) throw new Error(`line ${index + 1}: tab indentation is not supported`);
		const indent = raw.match(/^ */)[0].length;
		tokens.push({ indent, text: raw.slice(indent), line: index + 1 });
	});
	return tokens;
}

/** True for `key: something` / `key:` — but not for `https://x`. */
function looksLikeEntry(text) {
	const match = /^([^:]+):(\s|$)/.exec(text);
	return Boolean(match);
}

function parseMap(tokens, cursor, indent) {
	const out = {};

	while (cursor.i < tokens.length) {
		const token = tokens[cursor.i];
		if (token.indent < indent) break;
		if (token.indent > indent) {
			throw new Error(`line ${token.line}: unexpected indentation at "${token.text}"`);
		}
		if (!looksLikeEntry(token.text)) {
			throw new Error(`line ${token.line}: expected "key: value", got "${token.text}"`);
		}

		const colon = token.text.indexOf(':');
		const key = token.text.slice(0, colon).trim();
		const inline = token.text.slice(colon + 1).trim();
		cursor.i++;

		if (inline !== '') {
			out[key] = parseScalar(inline);
			continue;
		}

		const next = tokens[cursor.i];
		if (next && next.indent > indent) {
			out[key] =
				next.text === '-' || next.text.startsWith('- ')
					? parseSeq(tokens, cursor, next.indent)
					: parseMap(tokens, cursor, next.indent);
		} else {
			out[key] = null;
		}
	}

	return out;
}

function parseSeq(tokens, cursor, indent) {
	const out = [];

	while (cursor.i < tokens.length) {
		const token = tokens[cursor.i];
		if (token.indent < indent) break;
		if (token.indent > indent) {
			throw new Error(`line ${token.line}: unexpected indentation inside a list`);
		}
		if (!(token.text === '-' || token.text.startsWith('- '))) break;

		const rest = token.text.slice(1).trim();
		cursor.i++;

		if (rest === '') {
			const next = tokens[cursor.i];
			out.push(next && next.indent > indent ? parseMap(tokens, cursor, next.indent) : null);
		} else if (looksLikeEntry(rest)) {
			// `- key: value`, plus any continuation lines indented under it.
			const own = [{ indent: indent + 2, text: rest, line: token.line }];
			while (cursor.i < tokens.length && tokens[cursor.i].indent > indent) {
				const cont = tokens[cursor.i];
				if (cont.indent !== indent + 2) {
					throw new Error(`line ${cont.line}: list entries must keep a flat shape`);
				}
				own.push(cont);
				cursor.i++;
			}
			out.push(parseMap(own, { i: 0 }, indent + 2));
		} else {
			out.push(parseScalar(rest));
		}
	}

	return out;
}

/** `---\n…\n---\n\nbody` → `{ data, body }`. */
export function parseDocument(text) {
	const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
	const lines = source.split('\n');

	if (lines[0]?.trim() !== '---') return { data: {}, body: source };

	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === '---') {
			end = i;
			break;
		}
	}
	if (end === -1) throw new Error('frontmatter opens with --- but never closes');

	const data = parseMap(tokenise(lines.slice(1, end)), { i: 0 }, 0);
	const body = lines
		.slice(end + 1)
		.join('\n')
		.replace(/^\n+/, '');

	return { data, body };
}

const PLAIN_UNSAFE_START = /^[-?:,[\]{}#&*!|>'"%@`]/;
const PLAIN_RESERVED = /^(true|false|null|yes|no|on|off|~)$/i;
const PLAIN_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const PLAIN_DATELIKE = /^\d{4}-\d{2}-\d{2}/;

/** Emit a value the plain way when that is unambiguous, quoted otherwise. */
function emitScalar(value) {
	if (value === null || value === undefined) return '""';
	if (typeof value === 'boolean' || typeof value === 'number') return String(value);

	const text = String(value);
	if (text === '') return '""';
	if (/^[\s]|\s$/.test(text)) return JSON.stringify(text);
	if (/[\n\r\t]/.test(text)) return JSON.stringify(text);
	if (PLAIN_UNSAFE_START.test(text)) return JSON.stringify(text);
	if (text.includes(': ')) return JSON.stringify(text);
	if (/\s#/.test(text)) return JSON.stringify(text);
	if (PLAIN_RESERVED.test(text)) return JSON.stringify(text);
	if (PLAIN_NUMBER.test(text)) return JSON.stringify(text);
	if (PLAIN_DATELIKE.test(text)) return JSON.stringify(text);

	return text;
}

function emitValue(lines, indent, key, value) {
	const pad = ' '.repeat(indent);

	if (Array.isArray(value)) {
		if (value.length === 0) {
			lines.push(`${pad}${key}: []`);
			return;
		}

		lines.push(`${pad}${key}:`);
		for (const item of value) {
			if (item && typeof item === 'object' && !Array.isArray(item)) {
				const entries = Object.entries(item);
				if (entries.length === 0) {
					lines.push(`${pad}  - {}`);
					continue;
				}
				entries.forEach(([childKey, childValue], index) => {
					const lead = index === 0 ? `${pad}  - ` : `${pad}    `;
					if (childValue !== null && typeof childValue === 'object') {
						throw new Error(`nested "${key}.${childKey}" is too deep for this writer`);
					}
					lines.push(`${lead}${childKey}: ${emitScalar(childValue)}`);
				});
			} else {
				lines.push(`${pad}  - ${emitScalar(item)}`);
			}
		}
		return;
	}

	if (value && typeof value === 'object') {
		lines.push(`${pad}${key}:`);
		for (const [childKey, childValue] of Object.entries(value)) {
			if (childValue === null || childValue === undefined) continue;
			emitValue(lines, indent + 2, childKey, childValue);
		}
		return;
	}

	lines.push(`${pad}${key}: ${emitScalar(value)}`);
}

/** `{ data, body }` → file text. Empty and null values are dropped. */
export function stringifyDocument(data, body) {
	const lines = [];

	for (const [key, value] of Object.entries(data)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value) && value.length === 0) continue;
		emitValue(lines, 0, key, value);
	}

	const trimmed = String(body ?? '').replace(/\s+$/, '');
	return `---\n${lines.join('\n')}\n---\n\n${trimmed}\n`;
}
