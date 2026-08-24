import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'

import { NodeFileSystem, NodePath } from '@effect/platform-node'
import { noopLogger } from '@systemfsoftware/stryker-js-plugin-api/logging'

import * as Scope from 'effect/Scope'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'
import { LoggingServerAddressService, LoggingServerLive } from './logging/logging-server.js'
import { LoggingServerNotTcpError } from './logging/logging-server.schema.js'
import { PrepareLogger } from './run-stages/1-prepare-executor.js'
import { prepareStage } from './run-stages/1-prepare-executor.js'
import { InstrumentLogger } from './run-stages/2-mutant-instrumenter-executor.js'
import { instrumentStage } from './run-stages/2-mutant-instrumenter-executor.js'
import { DryRunLogger } from './run-stages/3-dry-run-executor.js'
import { dryRunStage } from './run-stages/3-dry-run-executor.js'
import { MutationTestLogger } from './run-stages/4-mutation-test-executor.js'
import { mutationTestStage } from './run-stages/4-mutation-test-executor.js'
import { PrepareFailedError } from './run-stages/stage.schema.js'
import { InstrumentFailedError } from './run-stages/stage.schema.js'
import { DryRunFailedError, DryRunNoTestsError } from './run-stages/stage.schema.js'
import { RunEnvironment, type RunEnvironmentShape } from './RunEnvironment.js'
import type { MutationRunStages } from './stryker.js'
import { ChildProcessSpawnerLive } from './worker-pool/child-process-proxy.js'
import type { IdGenerator } from './worker-pool/id-generator.js'
import { makeIdGenerator } from './worker-pool/id-generator.js'
import { ChildProcessCrashedError, OutOfMemoryError } from './worker-pool/worker-pool.schema.js'

export const IdGeneratorService = Context.Service<IdGenerator>('IdGenerator')

type DefaultStagesError =
  | PrepareFailedError
  | InstrumentFailedError
  | DryRunFailedError
  | DryRunNoTestsError
  | ChildProcessCrashedError
  | OutOfMemoryError
type DefaultStagesContext =
  | PrepareLogger
  | InstrumentLogger
  | DryRunLogger
  | MutationTestLogger
  | RunEnvironment
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
  | LoggingServerAddressService
  | IdGenerator
  | ChildProcessSpawner.ChildProcessSpawner
export const defaultStages: MutationRunStages<unknown, DefaultStagesContext> = {
  prepare: prepareStage,
  instrument: instrumentStage,
  dryRun: dryRunStage,
  mutationTest: mutationTestStage,
}
const provideLogger = <A>(tag: Context.Service<A, Logger>): Layer.Layer<A> => Layer.succeed(tag, noopLogger)
export const makeRunLayer = (
  env: RunEnvironmentShape,
): Layer.Layer<
  | RunEnvironment
  | PrepareLogger
  | InstrumentLogger
  | DryRunLogger
  | MutationTestLogger
  | FileSystem.FileSystem
  | Path.Path
  | LoggingServerAddressService
  | IdGenerator
  | ChildProcessSpawner.ChildProcessSpawner,
  LoggingServerNotTcpError,
  never
> =>
  Layer.mergeAll(
    Layer.succeed(RunEnvironment, env),
    provideLogger(PrepareLogger),
    provideLogger(InstrumentLogger),
    provideLogger(DryRunLogger),
    provideLogger(MutationTestLogger),
    NodeFileSystem.layer,
    NodePath.layer,
    LoggingServerLive,
    Layer.effect(IdGeneratorService, makeIdGenerator),
    ChildProcessSpawnerLive,
  )
