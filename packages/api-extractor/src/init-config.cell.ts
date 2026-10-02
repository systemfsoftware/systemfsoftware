import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

import { ConfigTemplateExists } from './config/init-config.schema.js'
import { CONFIG_TEMPLATE } from './config/init-config.template.js'
import { InternalInvariantError } from './errors/internal-invariant.schema.js'
import { InitConfig } from './init-config.schema.js'
import { ConfigTarget, resolveConfigTemplate } from './resolve-config-template.workflow.js'

const readTarget = (
  command: InitConfig,
): Effect.Effect<ConfigTarget, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const targetPath = path.resolve(command.targetFileName)
    const occupied = yield* fs.exists(targetPath)
    return new ConfigTarget({ targetPath, occupied })
  })

/** Writes the template at `targetPath`; the only failures are the filesystem's. */
const writeTemplateFile = (
  targetPath: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFileString(targetPath, CONFIG_TEMPLATE)
  })

export const initConfig = Sandwich.named('api_extractor.init_config')(readTarget)
  .decide(resolveConfigTemplate)
  .write({
    TemplateWritten: (written) => writeTemplateFile(written.targetPath),
    TemplateRefused: (refused) => Effect.fail(new ConfigTemplateExists({ filePath: refused.targetPath })),
    CommandRejected: (rejected) =>
      Effect.die(new InternalInvariantError({ message: 'The template command failed to decode', cause: rejected })),
  })
