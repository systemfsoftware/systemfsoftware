import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'

import { filePresent, searchUpwards } from './config/folder-walk.js'
import { ConfigFileNotFound } from './errors/config.schema.js'
import { LocateConfig } from './locate-config.schema.js'
import { ConfigSearch, type ConfigLocationDecision, resolveConfigLocation } from './resolve-config-location.workflow.js'

const CONFIG_FILE_NAME = 'api-extractor.json'
const CONFIG_FOLDER_NAME = 'config'

const candidateInFolder = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<string>> =>
  filePresent(path.join(folder, CONFIG_FOLDER_NAME, CONFIG_FILE_NAME), fs).pipe(
    Effect.flatMap((nested) =>
      Option.match(nested, {
        onSome: Effect.succeedSome,
        onNone: () => filePresent(path.join(folder, CONFIG_FILE_NAME), fs),
      })),
  )

const readCandidate = (
  request: LocateConfig,
): Effect.Effect<ConfigSearch, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const found = yield* Option.match(Option.fromNullishOr(request.explicitPath), {
      onSome: Effect.succeedSome,
      onNone: () => searchUpwards(request.startFolder, path, (folder) => candidateInFolder(folder, fs, path)),
    })
    return new ConfigSearch({ startFolder: request.startFolder, foundPath: Option.getOrUndefined(found) })
  })

const writeLocation = (
  outcome: Result.Result<ConfigLocationDecision, never>,
  search: ConfigSearch,
): Effect.Effect<string, ConfigFileNotFound> =>
  Match.value(Result.merge(outcome)).pipe(
    Match.tag('ConfigLocated', ({ filePath }) => Effect.succeed(filePath)),
    Match.tag('ConfigNotLocated', () => Effect.fail(new ConfigFileNotFound({ filePath: search.startFolder }))),
    Match.exhaustive,
  )

export const locateConfig = Sandwich.named('api_extractor.locate_config')(readCandidate)
  .decide(resolveConfigLocation)
  .write(writeLocation)
