/**
 * The shared mutation-run options every package's `stryker.config.ts` extends
 * through the `@systemfsoftware/stryker-config/base` specifier. The engine
 * validates the resolved document, so this module declares plain data.
 */
declare const base: Record<string, unknown>
export default base
