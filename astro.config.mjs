// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

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
 * Deployment origin and sub-path.
 *
 * GitHub Pages serves a project repo from `https://<user>.github.io/<repo>/`, so
 * the deploy workflow feeds both values in from `actions/configure-pages` (which
 * also resolves them correctly for a custom domain). Locally neither is set,
 * which leaves the base at `/` so `npm run dev` stays on http://localhost:4321/.
 *
 * `withBase()` in `src/config.ts` applies the base to the links written by hand
 * in templates — Astro only rewrites the asset URLs it generates itself.
 */
const site = process.env.SITE_URL;
const base = process.env.BASE_PATH ?? '/';

// https://astro.build/config
export default defineConfig({
	site,
	base,

	vite: {
		resolve: {
			alias: [picomatchShim],
		},
	},
});
