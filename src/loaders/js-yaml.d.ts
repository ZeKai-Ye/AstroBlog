/**
 * `js-yaml` ships no types of its own and `@types/js-yaml` is not installed.
 * The loader only needs `load`, so declare that one function rather than add a
 * dependency purely for types.
 */
declare module 'js-yaml' {
	export function load(input: string): unknown;
}
