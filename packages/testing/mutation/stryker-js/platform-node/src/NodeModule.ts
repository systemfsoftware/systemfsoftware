import { Module, type ModuleRequire } from '@systemfsoftware/stryker-js/Module'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

interface NodeModule {
  createRequire(filename: string | URL): NodeRequire
  isBuiltin(moduleName: string): boolean
}

const makeModuleRequire = (nodeModule: NodeModule, filename: string | URL): ModuleRequire => {
  const requireFrom: NodeRequire = nodeModule.createRequire(filename)
  const requireFn: ModuleRequire = (request: string): unknown => requireFrom(request)
  requireFn.resolve = (request, options) => {
    if (options === undefined) {
      return requireFrom.resolve(request)
    }
    return requireFrom.resolve(request, { paths: [...(options.paths ?? [])] })
  }
  return requireFn
}

/**
 * The Node implementation of the {@link Module} port: every call routes
 * through the runtime's own `node:module` via `process.getBuiltinModule`, so
 * this package imports no host builtins and the import ban holds here too.
 *
 * @since 2.0.0
 */
export const nodeModuleLayer: Layer.Layer<Module> = Layer.effect(
  Module,
  Effect.sync(() => {
    const nodeModule: NodeModule = process.getBuiltinModule('node:module')
    return {
      createRequire: (filename) => makeModuleRequire(nodeModule, filename),
      isBuiltin: (moduleName) => nodeModule.isBuiltin(moduleName),
    }
  }),
)
