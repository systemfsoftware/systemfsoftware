import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

import { chooseConfigSource, ConfigSource } from './choose-config-source.workflow.js'
import { CONFIG_FILE_NAME, filePresent, searchUpwards } from './config/folder-walk.js'
import { ConfigFileNotFound } from './errors/config.schema.js'
import { InternalInvariantError } from './errors/internal-invariant.schema.js'
import type { LocateConfig } from './locate-config.schema.js'
import { ConfigSearch, resolveConfigLocation } from './resolve-config-location.workflow.js'

const CONFIG_FOLDER_NAME = 'config'

const candidateNames: ReadonlyArray<string> = [`${CONFIG_FOLDER_NAME}/${CONFIG_FILE_NAME}`, CONFIG_FILE_NAME]

const candidateInFolder = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<string>> =>
  Effect.flatMap(filePresent(path.join(folder, CONFIG_FOLDER_NAME, CONFIG_FILE_NAME), fs), (nested) =>
    Option.getOrElse(
      Option.map(nested, (found) => Effect.succeedSome(found)),
      () => filePresent(path.join(folder, CONFIG_FILE_NAME), fs),
    ))

const optionalFoundPath = (found: Option.Option<string>): { readonly foundPath?: string } =>
  found.pipe(
    Option.map((filePath: string) => ({ foundPath: filePath })),
    Option.getOrElse((): { readonly foundPath?: string } => ({})),
  )

const optionalExplicitPath = (explicitPath: string | undefined): { readonly explicitPath?: string } =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(explicitPath), (found) => ({ explicitPath: found })),
    (): { readonly explicitPath?: string } => ({}),
  )

const readConfigSource = (request: LocateConfig): Effect.Effect<ConfigSource, never> =>
  Effect.succeed(
    new ConfigSource({
      startFolder: request.startFolder,
      ...optionalExplicitPath(request.explicitPath),
    }),
  )

const sourceCell = Sandwich.named('api_extractor.config_source')(readConfigSource)
  .decide(chooseConfigSource)
  .write({
    ExplicitConfigSource: (decision, command) =>
      Effect.succeed(new ConfigSearch({ startFolder: command.startFolder, foundPath: decision.path })),
    SearchedConfigSource: (_decision, command) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const found = yield* searchUpwards(
          command.startFolder,
          path,
          (folder) => candidateInFolder(folder, fs, path),
        )
        const foundPathFields = optionalFoundPath(found)
        return new ConfigSearch({
          startFolder: command.startFolder,
          ...foundPathFields,
        })
      }),
    CommandRejected: (rejected) =>
      Effect.die(
        new InternalInvariantError({ message: 'The config source command failed to decode', cause: rejected }),
      ),
  })

const readSearch = (search: ConfigSearch): Effect.Effect<ConfigSearch, never> => Effect.succeed(search)

const locationCell = Sandwich.named('api_extractor.locate_config')(readSearch)
  .decide(resolveConfigLocation)
  .write({
    ConfigLocated: (located) => Effect.succeed(located.filePath),
    ConfigNotLocated: (_notLocated, search) =>
      Effect.fail(new ConfigFileNotFound({ startFolder: search.startFolder, candidateNames: [...candidateNames] })),
    CommandRejected: (rejected) =>
      Effect.die(
        new InternalInvariantError({ message: 'The config location command failed to decode', cause: rejected }),
      ),
  })

export const locateConfig: Cell.Cell<
  LocateConfig,
  string,
  ConfigFileNotFound | PlatformError,
  FileSystem.FileSystem | Path.Path
> = sourceCell.pipe(Cell.andThen(locationCell))
