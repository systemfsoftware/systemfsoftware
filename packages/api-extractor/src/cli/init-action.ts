/**
 * The `init` subcommand for the `api-extractor` CLI.
 *
 * Writes a starter `api-extractor.json` template into the current folder.
 * Fails with a user error if the file already exists.
 */
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as Terminal from 'effect/Terminal'
import { CliError, Command } from 'effect/unstable/cli'

const STARTER_TEMPLATE = `{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/index.d.ts",
  "compiler": {
    "tsconfigFilePath": "<projectFolder>/tsconfig.json"
  },
  "apiReport": {
    "enabled": true,
    "reportFileName": "<unscopedPackageName>.api.md"
  },
  "docModel": {
    "enabled": false
  },
  "dtsRollup": {
    "enabled": false
  }
}
`

const TARGET_FILENAME = 'api-extractor.json'

const fileAlreadyExistsError = (targetPath: string): CliError.UserError =>
  new CliError.UserError({
    cause: new Error(`The file already exists: ${targetPath}`),
    userMessage: `Unable to write ${TARGET_FILENAME}: file already exists at ${targetPath}`,
  })

export const initActionHandler = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const terminal = yield* Terminal.Terminal

  const targetPath = path.resolve(TARGET_FILENAME)
  const exists = yield* fs.exists(targetPath)
  if (exists) {
    return yield* fileAlreadyExistsError(targetPath)
  }

  yield* fs.writeFileString(targetPath, STARTER_TEMPLATE)
  yield* terminal.display(`Created ${targetPath}\n`)
})

export const initCommand = Command.make('init', {}, () => initActionHandler).pipe(
  Command.withDescription('Create a starter api-extractor.json configuration in the current folder'),
)
