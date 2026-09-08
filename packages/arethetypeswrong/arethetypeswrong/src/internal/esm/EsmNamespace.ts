import type { Package } from '@systemfsoftware/npm-package'
import { getCjsModuleNamespace } from './CjsNamespace.js'
import { getEsmModuleBindings } from './EsmBindings.js'
import { esmResolve } from './Resolve.js'

// Note: this doesn't handle ambiguous indirect exports which probably isn't worth the
// implementation complexity.

/** @internal */
export interface GetEsmModuleNamespaceOptions {
  /** Default: a fresh `new URL('file:///')` per call. */
  readonly parentURL?: URL
  /** Default: a fresh empty `Set` per top-level call; shared across recursion. */
  readonly seen?: Set<string>
}

/** @internal */
export function getEsmModuleNamespace(
  fs: Package,
  specifier: string,
  options?: GetEsmModuleNamespaceOptions,
): string[] {
  const parentURL = options?.parentURL ?? new URL('file:///')
  const seen = options?.seen ?? new Set<string>()
  const { format, url } = esmResolve(fs, specifier, parentURL)

  // Don't recurse for circular indirect exports
  if (seen.has(url.pathname)) {
    return []
  }
  seen.add(url.pathname)

  if (format === 'commonjs') {
    return [...getCjsModuleNamespace(fs, url)]
  }

  // Parse module bindings
  const bindings = (format ?? 'module') === 'module'
    ? getEsmModuleBindings(fs.readFile(url.pathname))
    // Maybe JSON, WASM, etc
    : { exports: ['default'], reexports: [] }

  // Concat indirect exports
  const indirect = bindings.reexports
    .flatMap((reexport) => getEsmModuleNamespace(fs, reexport, { parentURL: url, seen }))
    .filter((name) => name !== 'default')
  return [...new Set([...bindings.exports, ...indirect])]
}
