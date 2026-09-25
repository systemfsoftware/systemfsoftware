import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import type * as Terminal from 'effect/Terminal'
import { CliError, Command } from 'effect/unstable/cli'

import { CONFIG_FILE_NAME } from '../config/folder-walk.js'
import { ConfigTemplateExists } from '../config/init-config.schema.js'
import { initConfig } from '../init-config.cell.js'
import { InitConfig } from '../init-config.schema.js'
import { DebugFlag, failureTextOf } from './debug-flag.js'

const fileAlreadyExistsError = (targetPath: string): CliError.UserError =>
  new CliError.UserError({
    cause: new Error(`The file already exists: ${targetPath}`),
    userMessage: `Unable to write ${CONFIG_FILE_NAME}: file already exists at ${targetPath}`,
  })

const refusalOf = (failure: ConfigTemplateExists | PlatformError, debug: boolean): CliError.UserError =>
  Match.value(failure).pipe(
    Match.tag('ConfigTemplateExists', (refused) => fileAlreadyExistsError(refused.filePath)),
    Match.orElse((cause) =>
      new CliError.UserError({
        cause,
        userMessage: failureTextOf(cause, debug),
      })
    ),
  )

/** The `init` handler: write the starter config, refusing when the target file is occupied. */
const initActionHandler = (debug: boolean): Effect.Effect<
  void,
  CliError.UserError,
  FileSystem.FileSystem | Path.Path | Terminal.Terminal
> =>
  initConfig.pipe(
    Cell.mapError((failure) => refusalOf(failure, debug)),
  ).run(new InitConfig({ targetFileName: CONFIG_FILE_NAME }))

export const initCommand = Command.make('init', {}, () => Effect.flatMap(DebugFlag, initActionHandler)).pipe(
  Command.withDescription('Create a starter api-extractor.json configuration in the current folder'),
)
