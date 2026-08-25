import { createRequire } from 'node:module'

import * as Effect from 'effect/Effect'

import { StrykerError } from '../stryker-error.schema.js'

export function importModule(moduleName: string, basePath: string): Effect.Effect<unknown, StrykerError> {
  return Effect.tryPromise({
    try: () => {
      if (moduleName.startsWith('.') || moduleName.startsWith('/') || moduleName.startsWith('file://')) {
        return import(moduleName)
      }
      const req = createRequire(`${basePath}/noop.js`)
      return import(req.resolve(moduleName))
    },
    catch: (cause) => new StrykerError({ message: `Failed to import module "${moduleName}"`, cause }),
  })
}
