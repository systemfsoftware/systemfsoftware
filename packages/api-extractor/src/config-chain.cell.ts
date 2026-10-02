import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
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

/** Every failure following a configuration chain can refuse it with. */
type ChainError = ConfigReadError | PlatformError | ConfigExtendsResolutionError

/** What one step leaves for the composition that follows it: the links it read, or how to go on. */
type ChainContinuation = Cell.Cell<
  ChainStepInput,
  ReadonlyArray<RawConfigLink>,
  ChainError,
  FileSystem.FileSystem | Path.Path
>

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

/**
 * One read step of the chain: it reads the file and decides whether the chain is complete or
 * broken, or names the `extends` target to follow. The step answers its decision; the
 * composition below carries the step and its decision together, so no phase runs a cell of its
 * own.
 */
const stepCell = Sandwich.named('api_extractor.config_chain')(readChainStep)
  .decide(resolveExtendsChain)
  .write({
    FollowExtends: (decision) => Effect.succeed(decision),
    ChainComplete: (decision) => Effect.succeed(decision),
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

export const configChainCell: Cell.Cell<
  ChainStepInput,
  ReadonlyArray<RawConfigLink>,
  ConfigReadError | PlatformError,
  FileSystem.FileSystem | Path.Path
> = Cell.flatMap(
  Cell.Do.pipe(
    Cell.bind('command', () => Cell.id<ChainStepInput>()),
    Cell.bind('decision', () => stepCell),
  ),
  (step): ChainContinuation =>
    Match.value(step.decision).pipe(
      Match.tag('ChainComplete', (decision) =>
        Cell.succeed<ReadonlyArray<RawConfigLink>>([{ filePath: step.command.filePath, record: decision.record }])),
      Match.tag('FollowExtends', (decision) =>
        Cell.andThen(
          Cell.mapInput(
            extendsTargetCell,
            () =>
              new ExtendsTarget({ specifier: decision.specifier, fromFolder: decision.fromFolder }),
          ),
          (targetPath: string) =>
            Cell.map(
              Cell.mapInput(
                Cell.suspend(() =>
                  configChainCell
                ),
                (): ChainStepInput => ({
                  filePath: targetPath,
                  visited: [...step.command.visited, step.command.filePath],
                }),
              ),
              (bases): ReadonlyArray<RawConfigLink> => [
                { filePath: step.command.filePath, record: decision.record },
                ...bases,
              ],
            ),
        )),
      Match.exhaustive,
    ),
)
