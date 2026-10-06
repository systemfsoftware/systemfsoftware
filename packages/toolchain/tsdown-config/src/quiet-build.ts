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
 * into `defineConfig({ ...quietBuild, ... })`. It is imported at config-load
 * time by tsdown's own loader, so it must stay a plain module — no Deno
 * APIs and no `@std/*` imports.
 *
 * Apply alongside the `tsdown -l warn` build script: the CLI flag sets the log
 * level and gates the startup banner, and `suppressWarnings` is what drops the
 * plugin's non-actionable warning while leaving every other warning intact.
 */

/**
 * Matches the `rolldown-plugin-dts` notice that fires once per package because
 * this repo pins `typescript@7` on purpose. Suppressing it does not hide a real
 * emission problem — the notice is about the TypeScript *API* being unstable,
 * not about this build.
 */
const NON_ACTIONABLE_WARNINGS = [/TypeScript 7\.0 does not yet have a stable API/]

export const quietBuild = {
  suppressWarnings: NON_ACTIONABLE_WARNINGS,
} as const
