import { NodeFileSystem, NodePath, NodeSocketServer } from '@effect/platform-node'
import { errorToString } from '@systemfsoftware/stryker-js'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js'
import type {
  CompleteDryRunResult,
  DryRunOptions,
  DryRunResult,
  MutantRunOptions,
  MutantRunResult,
} from '@systemfsoftware/stryker-js'
import { TestRunner, TestRunnerFailed } from '@systemfsoftware/stryker-js'
import { Match, Schema as S } from 'effect'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization'
import * as RpcServer from 'effect/unstable/rpc/RpcServer'

import {
  create,
  decodeWorkerOptions,
  loadPlugins,
  MutantCoverageSchema,
  TestRunnerRpcs,
} from '@systemfsoftware/stryker-js-engine/worker'
import { nodeModuleLayer } from '../platform/node.js'
import { launchWorker, workerSocketPath } from './worker-runtime.js'

const isCompleteDryRun = (result: DryRunResult): result is CompleteDryRunResult => result.status === 'complete'

const COVERAGE_SETTLED: readonly ((result: DryRunResult, options: DryRunOptions) => boolean)[] = [
  (result) => result.status !== 'complete',
  (result) =>
    Option.exists(Option.liftPredicate(result, isCompleteDryRun), (complete) => complete.mutantCoverage !== undefined),
  (_result, options) => options.coverageAnalysis === 'off',
]

const coverageNeeded = (result: DryRunResult, options: DryRunOptions): boolean =>
  !COVERAGE_SETTLED.some((settled) => settled(result, options))

const normalizeDryRun = (result: DryRunResult): DryRunResult => {
  if (result.status === 'error') {
    return { ...result, errorMessage: errorToString(result.errorMessage) }
  }
  return result
}

const decodeCoverageInto = (result: DryRunResult): Effect.Effect<DryRunResult> =>
  Effect.gen(function*() {
    const decoded = yield* S.decodeUnknownEffect(S.optional(MutantCoverageSchema))(
      globalThis.__mutantCoverage__,
    ).pipe(Effect.orElseSucceed(() => undefined))
    return Option.match(Option.liftPredicate(result, isCompleteDryRun), {
      onNone: () => normalizeDryRun(result),
      onSome: (complete) =>
        Option.getOrElse(
          Option.map(Option.fromUndefinedOr(decoded), (coverage) => ({ ...complete, mutantCoverage: coverage })),
          (): DryRunResult => complete,
        ),
    })
  })

const withCoverage = (
  result: DryRunResult,
  options: DryRunOptions,
): Effect.Effect<DryRunResult> =>
  Match.value(coverageNeeded(result, options)).pipe(
    Match.when(true, () => decodeCoverageInto(result)),
    Match.when(false, () => Effect.succeed(normalizeDryRun(result))),
    Match.exhaustive,
  )

const normalizeMutantRun = (result: MutantRunResult): MutantRunResult => {
  if (result.status === 'error') {
    return { ...result, errorMessage: errorToString(result.errorMessage) }
  }
  return result
}

const readWorkerOptions = Effect.gen(function*() {
  const workerDir = process.env['STRYKER_WORKER_DIR'] ?? (yield* Effect.die(new Error('STRYKER_WORKER_DIR is not set')))
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const raw = yield* fs.readFileString(path.join(workerDir, 'options.json'))
  return yield* decodeWorkerOptions(raw)
})

const TestRunnerHandlers = TestRunnerRpcs.toLayer(
  Effect.gen(function*() {
    const options = yield* readWorkerOptions
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
        Layer.mergeAll(
          Layer.succeed(RunConfiguration, options),
          Layer.succeed(SandboxDirectory, process.cwd()),
          NodeFileSystem.layer,
          NodePath.layer,
          nodeModuleLayer,
        ),
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
  Layer.provide(RpcServer.layerProtocolSocketServer),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeSocketServer.layer({ path: workerSocketPath('test runner worker') })),
  Layer.provide(nodeModuleLayer),
)

launchWorker(MainLayer, 'test runner worker')
