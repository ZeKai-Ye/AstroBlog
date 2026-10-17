/**
 * KaTeX for the markdown this site renders.
 *
 * Astro 7 parses markdown with Sätteri, which knows math syntax natively —
 * `features: { math: true }` turns `$…$` and `$$…$$` into
 *
 *   <code class="language-math math-inline">E=mc^2</code>
 *   <pre><code class="language-math math-display">\int_0^1 x^2</code></pre>
 *
 * — the same shape remark-math produces, but Sätteri stops there: it hands the
 * TeX through as text. This plugin is the second half. It runs as a Sätteri HAST
 * visitor, finds those two shapes, and swaps each one for the HTML and MathML
 * KaTeX builds, so the formula is laid out at build time and the browser gets a
 * finished picture (and a MathML copy for screen readers and copy-paste). No
 * KaTeX script is shipped.
 *
 * Why a plugin instead of the well-known `remark-math` + `rehype-katex` pair:
 * those two only run on the `unified` processor, and naming that processor
 * replaces Sätteri at the same time. Sätteri's smart punctuation understands
 * that a straight quote after 中文 opens a quotation — `这些"低效"的` becomes
 * `这些“低效”的` — while `unified`'s remark-smartypants, written for Latin
 * text, turns both into closing marks (`这些”低效”的`). A Chinese blog notices.
 * Keeping Sätteri and adding forty lines here is the smaller price.
 *
 * A formula with a typo throws, naming the file: the build is the check, the
 * same deal `npm run images` makes with a missing picture.
 */
import { fileURLToPath } from 'node:url';
import katex from 'katex';

/** The class Sätteri puts on a math `<code>`, inline or display. */
const INLINE = 'math-inline';
const DISPLAY = 'math-display';

/** `className` is a string[] in HAST, but a bare string survives markdown too. */
function classes(node) {
	const value = node.properties?.className ?? [];
	return Array.isArray(value) ? value : String(value).split(/\s+/);
}

/**
 * KaTeX renders `<strong>`-ish markup as inline styles, i.e. a self-contained
 * element tree that needs nothing but `katex.min.css` — the stylesheet the
 * two markdown-rendering pages import.
 */
function render(tex, displayMode, ctx) {
	try {
		return katex.renderToString(tex.trim(), {
			displayMode,
			// A typo should fail the build rather than render a red `ParseError`.
			throwOnError: true,
			// Strict mode objects to unicode text in math (`$电压$` for
			// `$\text{电压}$`), which is worth a warning in a maths paper and is
			// noise here — see the note in astro.config.mjs.
			strict: 'ignore',
		});
	} catch (error) {
		const where = ctx.fileURL ? fileURLToPath(ctx.fileURL) : 'a markdown file';
		throw new Error(`KaTeX could not render $${tex.trim()}$ in ${where} — ${error.message}`);
	}
}

/**
 * `defineHastPlugin` from `satteri` is an identity function that only exists for
 * types, and `satteri` itself is a dependency of Astro rather than of this repo;
 * a plain object with the same shape needs neither import and stops the plugin
 * from binding to a package nobody declared.
 */
export const katexMath = {
	name: 'katex-math',

	/**
	 * Two visitors, because a display block arrives wrapped: Sätteri reads
	 * `$$…$$` as a fenced code block whose child is the math `<code>`. The
	 * wrapper has to go too — a KaTeX display span inside a `<pre>` would
	 * inherit the preformatted box — so the display visitor matches the `<pre>`
	 * and reads the TeX out of its only child.
	 *
	 * Math is excluded from syntax highlighting by Astro's own default
	 * (`syntaxHighlight.excludeLangs: ['math']`): Shiki runs before this plugin
	 * and would otherwise wrap the TeX in its own `<span>`s first.
	 */
	element: [
		{
			filter: ['pre'],
			visit(node, ctx) {
				const code = node.children?.[0];
				if (code?.type !== 'element' || code.tagName !== 'code') return;
				if (!classes(code).includes(DISPLAY)) return;
				return { type: 'raw', value: render(ctx.textContent(code), true, ctx) };
			},
		},
		{
			filter: ['code'],
			visit(node, ctx) {
				if (!classes(node).includes(INLINE)) return;
				return { type: 'raw', value: render(ctx.textContent(node), false, ctx) };
			},
		},
	],
};
