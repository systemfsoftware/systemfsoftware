import { Module } from '@systemfsoftware/stryker-js/Module'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

interface NodeModuleShape {
  createRequire(filename?: string | URL): {
    (request: string): unknown
    resolve(request: string, options?: { paths?: string[] }): string
  }
  isBuiltin(moduleName: string): boolean
}

declare const process: {
  getBuiltinModule(moduleName: 'node:module'): NodeModuleShape
}

/**
 * The Node implementation of the {@link Module} port for tests: every call
 * routes through the runtime's own `node:module` via
 * `process.getBuiltinModule`, mirroring the composition-root
 * `nodeModuleLayer` in `@systemfsoftware/stryker-js-cli`. Plugin layers
 * declare the full `PluginEnvironment` (including `Module`) in their
 * requirement channel even when the ignorer itself performs no I/O, so tests
 * provide this alongside the real `NodeFileSystem`/`NodePath` layers to close
 * the requirement down to `Scope`.
 */
export const nodeModuleTestLayer: Layer.Layer<Module> = Layer.effect(
  Module,
  Effect.sync(() => {
    const nodeModule = process.getBuiltinModule('node:module')
    return {
      createRequire: (filename: string | URL) => {
        const requireFn = nodeModule.createRequire(filename)
        const wrapped = Object.assign((request: string) => requireFn(request), {
          resolve: (request: string, options?: { paths?: readonly string[] }) => {
            if (options === undefined) {
              return requireFn.resolve(request)
            }
            return requireFn.resolve(request, { paths: [...options.paths ?? []] })
          },
        })
        return wrapped
      },
      isBuiltin: (moduleName: string) => nodeModule.isBuiltin(moduleName),
    }
  }),
)
