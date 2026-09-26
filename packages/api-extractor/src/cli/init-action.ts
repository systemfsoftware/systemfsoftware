import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { Command } from 'effect/unstable/cli'

import { CONFIG_FILE_NAME } from '../config/folder-walk.js'
import { ConfigTemplateExists } from '../config/init-config.schema.js'
import {
  initExistsHeaderText,
  initPathBlockText,
  initRecommendedLocationText,
  initWritesFileText,
} from '../console-text.js'
import { initConfig } from '../init-config.cell.js'
import { MessageWriter } from '../message-writer.service.js'
import type { CliServices } from './command.js'
import { DebugFlag } from './debug-flag.js'
import { failReported, narrateBanner, reportedFailure, reportedTextOf } from './narration.js'
import { CliReportedError } from './reported-failure.schema.js'

const writeInitSuccess = (
  targetPath: string,
): Effect.Effect<void, never, MessageWriter> =>
  Effect.flatMap(MessageWriter, (writer) =>
    Effect.andThen(
      writer.write('info', initWritesFileText(targetPath)),
      writer.write('info', initRecommendedLocationText()),
    ))

const occupiedInit = (
  targetPath: string,
  debug: boolean,
): Effect.Effect<never, CliReportedError, MessageWriter> =>
  Effect.flatMap(MessageWriter, (writer) =>
    Effect.andThen(
      writer.write('info', initExistsHeaderText()),
      Effect.andThen(
        writer.write('info', initPathBlockText(targetPath)),
        Effect.fail(reportedFailure('error', reportedTextOf('Unable to write output file', debug))),
      ),
    ))

const refuseInit = (
  failure: ConfigTemplateExists | PlatformError,
  targetPath: string,
  debug: boolean,
): Effect.Effect<never, CliReportedError, MessageWriter> =>
  Match.value(failure.pipe(Schema.is(ConfigTemplateExists))).pipe(
    Match.when(true, () => occupiedInit(targetPath, debug)),
    Match.when(false, () => Effect.fail(reportedFailure('error', reportedTextOf(failure.message, debug)))),
    Match.exhaustive,
  )

/**
 * The `init` handler: narrate upstream's banner, then write the template and its report lines. The
 * template cell is bound to the composition root's context, so its run edge needs no services.
 */
export const makeInitCommand = (context: Context.Context<CliServices>) => {
  const providedInit = Cell.provideContext(initConfig, context)

  const initActionHandler = (
    debug: boolean,
  ): Effect.Effect<void, CliReportedError, Path.Path | MessageWriter> =>
    Effect.gen(function*() {
      const path = yield* Path.Path
      const targetPath = path.resolve(CONFIG_FILE_NAME)
      yield* narrateBanner(false)
      const outcome = yield* providedInit.run({ _tag: 'InitConfig', targetFileName: CONFIG_FILE_NAME }).pipe(
        Effect.result,
      )
      yield* Result.match(outcome, {
        onSuccess: () => writeInitSuccess(targetPath),
        onFailure: (failure) => refuseInit(failure, targetPath, debug),
      })
    }).pipe(Effect.catchTag('CliReportedError', failReported))

  return Command.make('init', {}, () => Effect.flatMap(DebugFlag, initActionHandler)).pipe(
    Command.withDescription('Create a starter api-extractor.json configuration in the current folder'),
  )
}
