import * as Context from 'effect/Context'

export interface ModuleRequire {
  (request: string): unknown
  resolve: (request: string, options?: { readonly paths?: readonly string[] }) => string
}

export interface ModuleShape {
  readonly createRequire: (filename: string | URL) => ModuleRequire
  readonly isBuiltin: (moduleName: string) => boolean
}

export class Module extends Context.Service<Module, ModuleShape>()(
  '@systemfsoftware/stryker-js-cli/run/Module',
) {}
