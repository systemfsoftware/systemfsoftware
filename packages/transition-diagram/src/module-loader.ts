import { Effect } from 'effect'
import { runnerImport } from 'vite'
import { ModuleImportError } from './DiagramError.schema.js'
import { detailOf, type RawObject } from './shape.js'

export const importModule = (modulePath: string): Effect.Effect<RawObject, ModuleImportError> =>
  Effect.tryPromise({
    try: () => runnerImport<RawObject>(modulePath).then((result) => result.module),
    catch: (cause) => ModuleImportError.make({ module: modulePath, detail: detailOf(cause) }),
  })
