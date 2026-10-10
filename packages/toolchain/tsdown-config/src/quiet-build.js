/**
 * Build-output policy shared by every tsdown config in the workspace.
 *
 * The build is the loudest step in the gate: 30 packages each print a tsdown
 * banner, per-entry info, a size report, and — through `rolldown-plugin-dts` —
 * one identical "TypeScript 7.0 does not yet have a stable API" warning. None
 * of that is actionable. What *is* actionable (a real rolldown warning such as
 * the `'use client'` module-directive notice) must still reach the log.
 *
 * This is a config fragment, not a script: each `tsdown.config.ts` spreads it
 * into `defineConfig({ ...quietBuild, ... })`. tsdown's own loader imports it at
 * config-load time, from the consumer's node_modules once installed, and Node
 * refuses to strip types there, so it stays plain JavaScript with its types in
 * `quiet-build.d.ts`. It must import nothing: no Deno APIs, no `@std/*`.
 *
 * Apply alongside the `tsdown -l warn` build script: the CLI flag is what gates
 * the startup banner (it is read before the config file loads, so a `logLevel`
 * here could not suppress it), and `suppressWarnings` is what drops the
 * plugin's non-actionable warning while leaving every other warning intact.
 */

/**
 * Matches the `rolldown-plugin-dts` notice that fires once per package because
 * this repo pins `typescript@7` on purpose. Suppressing it does not hide a real
 * emission problem — the notice is about the TypeScript *API* being unstable,
 * not about this build.
 */
const NON_ACTIONABLE_WARNINGS = [/TypeScript 7\.0 does not yet have a stable API/]

/**
 * Typed by its own `quiet-build.d.ts`, the declaration consumers see, so
 * `checkJs` rejects a value that drifts from it.
 * @type {typeof import('./quiet-build.js').quietBuild}
 */
export const quietBuild = {
  logLevel: 'warn',
  suppressWarnings: NON_ACTIONABLE_WARNINGS,
}
