import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import {
  MainEntryPointNotFoundError,
  ProjectFolderNotFoundError,
  TsconfigFileNotFoundError,
} from '../errors/config.schema.js'
import { CompilerOverrideAbsent } from './extractor-config.schema.js'
import type { ExtractorConfig } from './extractor-config.schema.js'

type AbsentPathError =
  | MainEntryPointNotFoundError
  | ProjectFolderNotFoundError
  | TsconfigFileNotFoundError

interface PathPresence {
  readonly present: boolean
  readonly unreadable: Option.Option<PlatformError>
}

const probePath = (filePath: string): Effect.Effect<PathPresence, never, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.exists(filePath).pipe(
      Effect.map((present): PathPresence => ({ present, unreadable: Option.none() })),
      Effect.catchReason(
        'PlatformError',
        'NotFound',
        (): Effect.Effect<PathPresence> => Effect.succeed({ present: false, unreadable: Option.none() }),
      ),
      Effect.catch(
        (cause): Effect.Effect<PathPresence> => Effect.succeed({ present: false, unreadable: Option.some(cause) }),
      ),
    ))

interface PresenceEvidence {
  readonly projectFolder: PathPresence
  readonly mainEntryPoint: PathPresence
  readonly tsconfig: PathPresence
}

const gatherPresence = (config: ExtractorConfig): Effect.Effect<PresenceEvidence, never, FileSystem.FileSystem> =>
  Effect.all({
    projectFolder: probePath(config.projectFolder),
    mainEntryPoint: probePath(config.mainEntryPointFilePath),
    tsconfig: probePath(config.tsconfigFilePath),
  })

const tsconfigRequiredOf = (config: ExtractorConfig): boolean =>
  Schema.is(CompilerOverrideAbsent)(config.overrideTsconfig)

interface PresenceCandidate {
  readonly presence: PathPresence
  readonly refusal: () => AbsentPathError
}

const causeOf = (presence: PathPresence) =>
  Option.getOrElse(
    Option.map(presence.unreadable, (cause) => ({ cause })),
    () => ({}),
  )

const candidatesOf = (config: ExtractorConfig, evidence: PresenceEvidence): ReadonlyArray<PresenceCandidate> => {
  const always: ReadonlyArray<PresenceCandidate> = [
    {
      presence: evidence.projectFolder,
      refusal: () =>
        new ProjectFolderNotFoundError({ filePath: config.projectFolder, ...causeOf(evidence.projectFolder) }),
    },
    {
      presence: evidence.mainEntryPoint,
      refusal: () =>
        new MainEntryPointNotFoundError({
          filePath: config.mainEntryPointFilePath,
          ...causeOf(evidence.mainEntryPoint),
        }),
    },
  ]
  const tsconfig: PresenceCandidate = {
    presence: evidence.tsconfig,
    refusal: () => new TsconfigFileNotFoundError({ filePath: config.tsconfigFilePath, ...causeOf(evidence.tsconfig) }),
  }
  return Arr.appendAll(always, Arr.filter([tsconfig], () => tsconfigRequiredOf(config)))
}

const firstRefusalOf = (candidates: ReadonlyArray<PresenceCandidate>): Option.Option<AbsentPathError> =>
  Option.firstSomeOf(
    Arr.map(candidates, (candidate) =>
      Option.map(
        Option.filter(Option.some(candidate), (c) => c.presence.present === false),
        (c) => c.refusal(),
      )),
  )

/**
 * Upstream's prepare-time checks: the project folder, the declaration file, and — unless the
 * configuration overrides the compiler settings — the tsconfig file must all be on disk before
 * any analysis starts, and each refusal names the path it resolved. The read gathers every
 * probe's evidence unconditionally; the ordered refusal is decided here as data and run
 * through one `Effect.fromResult`.
 */
export const preparePresenceOf = (
  config: ExtractorConfig,
): Effect.Effect<void, AbsentPathError, FileSystem.FileSystem> =>
  gatherPresence(config).pipe(
    Effect.flatMap((evidence) =>
      Result.fromOption(firstRefusalOf(candidatesOf(config, evidence)), () => undefined).pipe(
        Result.flip,
        Effect.fromResult,
      )
    ),
  )
