// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
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
