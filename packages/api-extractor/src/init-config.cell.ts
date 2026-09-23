import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'
import * as Terminal from 'effect/Terminal'

import { ConfigTemplateExists } from './config/init-config.schema.js'
import { CONFIG_TEMPLATE } from './config/init-config.template.js'
import { InitConfig } from './init-config.schema.js'
import { ConfigTarget, type ConfigTemplateDecision, resolveConfigTemplate } from './resolve-config-template.workflow.js'

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

const writeTemplate = (
  outcome: Result.Result<ConfigTemplateDecision, never>,
): Effect.Effect<void, ConfigTemplateExists | PlatformError, FileSystem.FileSystem | Terminal.Terminal> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const terminal = yield* Terminal.Terminal
    return yield* Match.value(Result.merge(outcome)).pipe(
      Match.tag('TemplateWritten', ({ targetPath }) =>
        Effect.andThen(
          fs.writeFileString(targetPath, CONFIG_TEMPLATE),
          terminal.display(`Created ${targetPath}\n`),
        )),
      Match.tag('TemplateRefused', ({ targetPath }) => Effect.fail(new ConfigTemplateExists({ filePath: targetPath }))),
      Match.exhaustive,
    )
  })

export const initConfig = Sandwich.named('api_extractor.init_config')(readTarget)
  .decide(resolveConfigTemplate)
  .write(writeTemplate)
