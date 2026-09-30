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

// https://astro.build/config
export default defineConfig({
	// Set this to the deployed origin so <link rel="canonical"> is emitted:
	// site: 'https://your-domain.example',

	vite: {
		resolve: {
			alias: [picomatchShim],
		},
	},
});
