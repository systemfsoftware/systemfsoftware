import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import type { PlatformError } from 'effect/PlatformError'
import { CliError, Command } from 'effect/unstable/cli'

import { ConfigTemplateExists } from '../config/init-config.schema.js'
import { CONFIG_FILE_NAME } from '../config/init-config.template.js'
import { initConfig } from '../init-config.cell.js'
import { InitConfig } from '../init-config.schema.js'

const fileAlreadyExistsError = (targetPath: string): CliError.UserError =>
  new CliError.UserError({
    cause: new Error(`The file already exists: ${targetPath}`),
    userMessage: `Unable to write ${CONFIG_FILE_NAME}: file already exists at ${targetPath}`,
  })

const refusalOf = (failure: ConfigTemplateExists | PlatformError): CliError.UserError =>
  Match.value(failure).pipe(
    Match.tag('ConfigTemplateExists', (refused) => fileAlreadyExistsError(refused.filePath)),
    Match.orElse((cause) =>
      new CliError.UserError({
        cause,
        userMessage: `Unable to write ${CONFIG_FILE_NAME}: ${cause.message}`,
      })
    ),
  )

export const initActionHandler = initConfig.pipe(
  Cell.mapError(refusalOf),
).run(new InitConfig({ targetFileName: CONFIG_FILE_NAME }))

export const initCommand = Command.make('init', {}, () => initActionHandler).pipe(
  Command.withDescription('Create a starter api-extractor.json configuration in the current folder'),
)
