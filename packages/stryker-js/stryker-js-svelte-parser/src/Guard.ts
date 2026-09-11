/**
 * Guard — the package's one non-null-object guard. Foreign values arrive as
 * `unknown` (a compiler module resolved at run time, a svelte AST the compiler
 * produced), so every reader narrows through this guard instead of declaring a
 * field check of its own.
 */

/** Narrows to a non-null object whose fields are still `unknown`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
