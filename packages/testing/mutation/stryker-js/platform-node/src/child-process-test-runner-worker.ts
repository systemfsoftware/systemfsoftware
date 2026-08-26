import { NodeFileSystem, NodePath, NodeWorkerRunner } from '@effect/platform-node'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import type {
  DryRunOptions,
  DryRunResult,
  MutantRunOptions,
  MutantRunResult,
} from '@systemfsoftware/stryker-js/TestRunner'
import { TestRunner, TestRunnerFailed } from '@systemfsoftware/stryker-js/TestRunner'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as S from 'effect/Schema'
import * as RpcServer from 'effect/unstable/rpc/RpcServer'
import * as RpcWorker from 'effect/unstable/rpc/RpcWorker'

import { create, loadPlugins } from './Plugins.js'
import { MutantCoverageSchema } from './TestRunner.schema.js'
import { TestRunnerRpcs } from './WorkerProtocol.js'

const withCoverage = (
  result: DryRunResult,
  options: DryRunOptions,
): Effect.Effect<DryRunResult> =>
  Effect.gen(function*() {
    if (result.status === 'error') {
      return { ...result, errorMessage: errorToString(result.errorMessage) }
    }
    if (result.status !== 'complete') return result
    if (result.mutantCoverage !== undefined) return result
    if (options.coverageAnalysis === 'off') return result
    const decoded = yield* S.decodeUnknownEffect(S.optional(MutantCoverageSchema))(
      globalThis.__mutantCoverage__,
    ).pipe(Effect.orElseSucceed(() => undefined))
    if (decoded === undefined) return result
    return { ...result, mutantCoverage: decoded }
  })

const normalizeMutantRun = (result: MutantRunResult): MutantRunResult => {
  if (result.status === 'error') {
    return { ...result, errorMessage: errorToString(result.errorMessage) }
  }
  return result
}

const TestRunnerHandlers = TestRunnerRpcs.toLayer(
  Effect.gen(function*() {
    const options = yield* RpcWorker.initialMessage(StrykerOptionsSchema)
    const runnerName = options.testRunner
    const failed =
      (phase: 'capabilities' | 'dryRun' | 'init' | 'mutantRun') =>
      (cause: Cause.Cause<unknown>): Effect.Effect<never, TestRunnerFailed> =>
        Effect.fail(new TestRunnerFailed({ cause: Cause.pretty(cause), phase, runnerName }))

    const loaded = yield* loadPlugins(options.plugins, process.cwd()).pipe(
      Effect.catchCause(failed('init')),
    )
    const underlying = yield* create(loaded.pluginsByKind, 'TestRunner', runnerName).pipe(
      Effect.flatMap((contribution) => TestRunner.pipe(Effect.provide(contribution.layer))),
      Effect.provide(
        Layer.merge(Layer.succeed(RunConfiguration, options), Layer.succeed(SandboxDirectory, process.cwd())),
      ),
      Effect.catchCause(failed('init')),
    )
    yield* underlying.init.pipe(Effect.catchCause(failed('init')))
    yield* Effect.addFinalizer(() => underlying.dispose.pipe(Effect.ignore))

    return {
      capabilities: () => underlying.capabilities.pipe(Effect.catchCause(failed('capabilities'))),

      dryRun: ({ options: runOptions }: { readonly options: DryRunOptions }) =>
        underlying.dryRun(runOptions).pipe(
          Effect.flatMap((result) => withCoverage(result, runOptions)),
          Effect.catchCause(failed('dryRun')),
        ),

      mutantRun: ({ options: runOptions }: { readonly options: MutantRunOptions }) =>
        underlying.mutantRun(runOptions).pipe(
          Effect.map(normalizeMutantRun),
          Effect.catchCause(failed('mutantRun')),
        ),
    }
  }),
).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)))

const MainLayer = RpcServer.layer(TestRunnerRpcs).pipe(
  Layer.provide(TestRunnerHandlers),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(NodeWorkerRunner.layer),
)

Effect.runFork(Layer.launch(MainLayer))
