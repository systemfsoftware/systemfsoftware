import { Effect, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'
import { DiagramConfig } from './DiagramConfig.schema.js'
import { ConfigDecodeError, ConfigFileMissingError, type ModuleImportError } from './DiagramError.schema.js'
import { importModule } from './module-loader.js'
import type { Raw } from './shape.js'

export const CONFIG_FILE = 'transition-diagram.config.ts'

export const decodeDiagramConfig = (input: Raw): Result.Result<DiagramConfig, ConfigDecodeError> =>
  Result.mapError(
    Schema.decodeUnknownResult(DiagramConfig)(input),
    (error) => ConfigDecodeError.make({ detail: error.message }),
  )

export type ConfigError = ConfigDecodeError | ConfigFileMissingError | ModuleImportError | PlatformError

export const loadDiagramConfig = (
  cwd: string,
): Effect.Effect<DiagramConfig, ConfigError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = `${cwd}/${CONFIG_FILE}`
    const exists = yield* fs.exists(path)
    if (!exists) {
      return yield* ConfigFileMissingError.make({ path })
    }
    const imported = yield* importModule(path)
    return yield* Effect.fromResult(decodeDiagramConfig(imported['default']))
  })
