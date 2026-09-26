import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'

import {
  MainEntryPointNotFoundError,
  ProjectFolderNotFoundError,
  TsconfigFileNotFoundError,
} from '../errors/config.schema.js'
import type { ExtractorConfig } from './extractor-config.schema.js'

type AbsentPathError =
  | MainEntryPointNotFoundError
  | ProjectFolderNotFoundError
  | TsconfigFileNotFoundError

const presentOnDisk = (filePath: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.exists(filePath).pipe(Effect.orElseSucceed(() => false)))

const refusedUnlessPresent = (
  filePath: string,
  refusal: () => AbsentPathError,
): Effect.Effect<void, AbsentPathError, FileSystem.FileSystem> =>
  Effect.flatMap(
    presentOnDisk(filePath),
    (present) => (present ? Effect.void : Effect.fail(refusal())),
  )

/**
 * Upstream's prepare-time checks: the project folder, the declaration file, and — unless the
 * configuration overrides the compiler settings — the tsconfig file must all be on disk before
 * any analysis starts, and each refusal names the path it resolved.
 */
export const preparePresenceOf = (
  config: ExtractorConfig,
): Effect.Effect<void, AbsentPathError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    yield* refusedUnlessPresent(config.projectFolder, () =>
      new ProjectFolderNotFoundError({ filePath: config.projectFolder }))
    yield* refusedUnlessPresent(
      config.mainEntryPointFilePath,
      () =>
        new MainEntryPointNotFoundError({ filePath: config.mainEntryPointFilePath }),
    )
    if (Option.isNone(Option.fromNullishOr(config.overrideTsconfig))) {
      yield* refusedUnlessPresent(
        config.tsconfigFilePath,
        () => new TsconfigFileNotFoundError({ filePath: config.tsconfigFilePath }),
      )
    }
  })
