import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'

import { NodeFileSystem, NodePath } from '@effect/platform-node'
import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'

import * as Scope from 'effect/Scope'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'
import { EngineLogLevel, layer as engineLogLevelLayer, makeEngineLogger } from './engine-logger.js'
import { RunEnvironment, type RunEnvironmentShape } from './run-environment.js'
import { DryRunLogger } from './run-stages/dry-run-stage.js'
import { dryRunStage } from './run-stages/dry-run-stage.js'
import { InstrumentLogger } from './run-stages/instrument-stage.js'
import { instrumentStage } from './run-stages/instrument-stage.js'
import { MutationTestLogger } from './run-stages/mutation-test-stage.js'
import { mutationTestStage } from './run-stages/mutation-test-stage.js'
import { PrepareLogger, prepareStage } from './run-stages/prepare-stage.js'
import { StageError } from './run-stages/stage.schema.js'
import type { MutationRunStages } from './stryker.js'
import { IdGenerator, layer as idGeneratorLayer } from './worker-pool/id-generator.js'
import { ChildProcessCrashedError, OutOfMemoryError } from './worker-pool/worker-pool.schema.js'

type DefaultStagesError =
  | StageError
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
  | IdGenerator
  | ChildProcessSpawner.ChildProcessSpawner
  | EngineLogLevel
export const defaultStages: MutationRunStages<unknown, DefaultStagesContext> = {
  prepare: prepareStage,
  instrument: instrumentStage,
  dryRun: dryRunStage,
  mutationTest: mutationTestStage,
}
const provideLogger = <A>(tag: Context.Service<A, Logger>): Layer.Layer<A, never, EngineLogLevel> =>
  Layer.effect(tag, Effect.map(EngineLogLevel, makeEngineLogger))
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
  | IdGenerator
  | ChildProcessSpawner.ChildProcessSpawner
  | EngineLogLevel,
  never,
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
    idGeneratorLayer,
    NodeChildProcessSpawner.layer.pipe(
      Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
    ),
  ).pipe(Layer.provideMerge(engineLogLevelLayer))
