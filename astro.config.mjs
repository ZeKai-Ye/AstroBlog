// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { katexMath } from './tools/markdown-katex.mjs';
import { localEditor } from './tools/editor/plugin.mjs';

/**
 * `picomatch` is CommonJS-only, and Astro 7.3.5 inlines it into the Vite
 * environment that loads `src/content.config.ts` (see
 * `tools/picomatch-esm.mjs` for the full story). Pointing the bare specifier at
 * a Node-loaded ESM wrapper fixes `astro sync` / `astro build` without patching
 * any dependency. The regex is anchored so subpath imports such as
 * `picomatch/lib/utils` are left alone.
 */
const picomatchShim = {
	find: /^picomatch$/,
	replacement: fileURLToPath(new URL('./tools/picomatch-esm.mjs', import.meta.url)),
};

/**
 * Deployment origin and sub-path, both optional.
 *
 * The site is deployed through Cloudflare's Git integration, which serves it
 * from the domain root — so neither needs to be set. `SITE_URL` is only there to
 * emit `<link rel="canonical">` (skip it and the tag is left out); `BASE_PATH`
 * exists so the same build could be moved under a sub-path, and `withBase()` in
 * `src/config.ts` is what applies it to the links written by hand in templates,
 * since Astro only rewrites the asset URLs it generates itself.
 */
const site = process.env.SITE_URL;
const base = process.env.BASE_PATH ?? '/';

// https://astro.build/config
export default defineConfig({
	site,
	base,

	/**
	 * Math in markdown, the way it is written in Obsidian and on paper:
	 * `$E = mc^2$` inline, `$$…$$` on its own line for a display block.
	 *
	 * Astro 7 parses markdown with Sätteri (Rust), which reads those two forms
	 * itself but hands the TeX through as text — `features.math` is off by
	 * default. Turning it on is half the job; `tools/markdown-katex.mjs` is the
	 * other half, a HAST visitor that swaps each formula for the HTML and MathML
	 * KaTeX renders, at build time. No KaTeX script reaches the browser, no
	 * formula is laid out by JavaScript.
	 *
	 * The obvious alternative — `remark-math` + `rehype-katex`, as every guide
	 * shows — is not an option here without a second swap: those are unified
	 * plugins, so they need `@astrojs/markdown-remark`'s `unified()` processor,
	 * which would replace Sätteri for the whole site. That costs the Chinese
	 * typography: Sätteri's smart punctuation opens `这些"低效"的` as
	 * `这些“低效”的`, while unified's remark-smartypants, written for Latin
	 * text, closes both (`这些”低效”的`). See the comment in the plugin.
	 *
	 * The KaTeX stylesheet is imported by the two pages that render markdown
	 * (`blog/[...slug].astro` and `authors/[...id].astro`), not by the layout, so
	 * the front page and the search page never download it; its font files are
	 * fetched only for the glyphs a formula actually uses.
	 *
	 * `strict: 'ignore'` is set in the plugin: KaTeX's strict mode complains
	 * about unicode text inside math (`$\text{电压}$` written as `$电压$`), which
	 * is worth a warning in a maths paper and is noise here. A formula with a
	 * real typo still fails the build, naming the file and the TeX it choked on.
	 */
	markdown: {
		processor: satteri({
			features: { math: true },
			hastPlugins: [katexMath],
		}),
	},

	vite: {
		plugins: [
			/**
			 * The local editor, served at /__edit by `npm run dev`. It is a
			 * `apply: 'serve'` plugin, so a build never constructs it — there is
			 * no dev-only route that could reach Cloudflare.
			 */
			localEditor(),
		],
		resolve: {
			alias: [picomatchShim],
		},
	},
});
