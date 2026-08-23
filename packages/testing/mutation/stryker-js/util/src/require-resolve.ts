/// <reference types="node" />
import { createRequire } from 'node:module'

/**
 * Require a module from the current working directory (or a different base dir)
 * @see https://nodejs.org/api/modules.html#modules_require_resolve_paths_request
 */
export function requireResolve(id: string, from = process.cwd()): unknown {
  const require = createRequire(import.meta.url)
  return require(resolveFromCwd(id, from))
}

/**
 * Resolves a module from the current working directory (or a different base dir).
 *
 * Not exported: `requireResolve` above is the only caller, and a second
 * resolver on the surface invites a consumer to resolve a path this package
 * then never loads.
 *
 * @see https://nodejs.org/api/modules.html#modules_require_resolve_paths_request
 */
function resolveFromCwd(id: string, cwd = process.cwd()): string {
  const require = createRequire(import.meta.url)
  return require.resolve(id, { paths: [cwd] })
}
