/**
 * CommonJS → ESM bridge for `picomatch`.
 *
 * Why this file exists
 * --------------------
 * Astro 7.3.5 runs `src/content.config.ts` through the Vite environment named
 * `astro`, and it marks its own package as `noExternal` in that environment. So
 * `astro/dist/content/loaders/glob.js` gets inlined by Vite's module runner —
 * and that file does `import picomatch from "picomatch"`.
 *
 * `picomatch` is CommonJS-only (`main: index.js`, no `exports`, no `type`), and
 * Vite's module runner has no CJS interop: it evaluates the file as ESM and the
 * `require` calls inside throw "require is not defined". Forcing the package
 * into `resolve.external` only swaps one error for "Cannot find module".
 *
 * Aliasing the bare specifier to this file (see `astro.config.mjs`) makes the
 * inlined module load the real CJS package through Node's own loader instead,
 * which handles both module systems correctly.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const picomatch = require('picomatch');

export default picomatch;

export const isMatch = picomatch.isMatch;
export const makeRe = picomatch.makeRe;
export const scan = picomatch.scan;
export const parse = picomatch.parse;
export const compile = picomatch.compile;
export const test = picomatch.test;
export const matchBase = picomatch.matchBase;
