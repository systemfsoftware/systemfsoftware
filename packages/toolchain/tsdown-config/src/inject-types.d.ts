/** One value of a package `exports` map as tsdown hands it to `customExports`. */
export type ExportEntry = string | Record<string, string | undefined>

/**
 * A tsdown `exports.customExports` hook: sets the root entry's `types` to
 * `./dist/index.d.ts` and moves `default` after it.
 */
export declare const injectTypes: (exports: Record<string, ExportEntry>) => Record<string, ExportEntry>
