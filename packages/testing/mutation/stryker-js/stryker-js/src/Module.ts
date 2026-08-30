import * as Context from 'effect/Context'

/**
 * The subset of `node:module`'s `createRequire` result this port certifies: a
 * require function bound to one path, plus its resolution. Calling it loads
 * the specifier exactly as a module evaluated next to that path would.
 */
export interface ModuleRequire {
  (request: string): unknown
  resolve(request: string, options?: { readonly paths?: readonly string[] }): string
}

/**
 * Port over the host module loader, shaped as the subset of `node:module`
 * feature code may use: `createRequire` and `isBuiltin`. Resolving a
 * specifier against a project directory, importing a plugin, and asking
 * whether a name is a builtin all go through this one tag; no feature module
 * touches the host module API. The Node implementation ships in
 * `@systemfsoftware/stryker-js-platform-node`; tests substitute a layer
 * returning fixed paths.
 *
 * @since 2.0.0
 */
export class Module extends Context.Service<Module, {
  readonly createRequire: (filename: string | URL) => ModuleRequire
  readonly isBuiltin: (moduleName: string) => boolean
}>()('@systemfsoftware/stryker-js/Module') {}
