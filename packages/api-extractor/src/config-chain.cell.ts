import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

import { dirname } from './analyzer/path-helpers.js'
import type { ConfigReadError, RawConfigLink } from './config/extractor-config.js'
import { readOptionalText } from './config/folder-walk.js'
import {
  CircularConfigExtendsError,
  ConfigExtendsResolutionError,
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
} from './errors/config.schema.js'
import { InternalInvariantError } from './errors/internal-invariant.schema.js'
import { ConfigChainStep, resolveExtendsChain } from './resolve-extends-chain.workflow.js'
import { ExtendsTarget, resolveExtendsTarget } from './resolve-extends-target.workflow.js'

export interface ChainStepInput {
  readonly filePath: string
  readonly visited: ReadonlyArray<string>
}

const readChainStep = (
  input: ChainStepInput,
): Effect.Effect<(typeof ConfigChainStep)['Encoded'], PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const content = yield* readOptionalText(input.filePath, fs)
    return {
      _tag: 'ConfigChainStep',
      filePath: input.filePath,
      fromFolder: dirname(input.filePath),
      visited: [...input.visited],
      content: Option.getOrUndefined(content),
    }
  })

const resolveFromNodeModules = (
  specifier: string,
  fromFolder: string,
): Effect.Effect<string, ConfigExtendsResolutionError> =>
  Effect.try({
    try: () => process.getBuiltinModule('module').createRequire(`${fromFolder}/`).resolve(specifier),
    catch: (cause) => new ConfigExtendsResolutionError({ specifier, cause }),
  })

const readExtendsTarget = (command: ExtendsTarget): Effect.Effect<(typeof ExtendsTarget)['Encoded']> =>
  Effect.succeed({
    _tag: 'ExtendsTarget',
    specifier: command.specifier,
    fromFolder: command.fromFolder,
  })

const extendsTargetCell: Cell.Cell<ExtendsTarget, string, ConfigExtendsResolutionError, Path.Path> = Sandwich.named(
  'api_extractor.extends_target',
)(readExtendsTarget)
  .decide(resolveExtendsTarget)
  .write({
    RelativeExtendsTarget: (decision) =>
      Effect.gen(function*() {
        const path = yield* Path.Path
        return path.resolve(decision.fromFolder, decision.specifier)
      }),
    ModuleExtendsTarget: (decision) => resolveFromNodeModules(decision.specifier, decision.fromFolder),
    CommandRejected: (rejected) =>
      Effect.die(
        new InternalInvariantError({
          message: 'The extends target command failed to decode',
          cause: rejected,
        }),
      ),
  })

export const configChainCell: Cell.Cell<
  ChainStepInput,
  ReadonlyArray<RawConfigLink>,
  ConfigReadError | PlatformError,
  FileSystem.FileSystem | Path.Path
> = Sandwich.named('api_extractor.config_chain')(readChainStep)
  .decide(resolveExtendsChain)
  .write({
    FollowExtends: (decision, command) =>
      Effect.flatMap(
        extendsTargetCell.run(
          new ExtendsTarget({ specifier: decision.specifier, fromFolder: decision.fromFolder }),
        ),
        (targetPath) =>
          Effect.map(
            configChainCell.run({ filePath: targetPath, visited: [...command.visited, command.filePath] }),
            (bases): ReadonlyArray<RawConfigLink> => [
              { filePath: command.filePath, record: decision.record },
              ...bases,
            ],
          ),
      ),
    ChainComplete: (decision, command) =>
      Effect.succeed<ReadonlyArray<RawConfigLink>>([{ filePath: command.filePath, record: decision.record }]),
    CircularExtends: (decision) => Effect.fail(new CircularConfigExtendsError({ chain: [...decision.chain] })),
    ChainMissing: (decision) =>
      Effect.fail(
        new ConfigFileNotFound({ startFolder: decision.fromFolder, candidateNames: [decision.filePath] }),
      ),
    ChainMalformed: (decision) =>
      Effect.fail(new ConfigJsonSyntaxError({ filePath: decision.filePath, cause: decision.cause })),
    CommandRejected: (rejected) =>
      Effect.die(
        new InternalInvariantError({ message: 'The config chain command failed to decode', cause: rejected }),
      ),
  })
