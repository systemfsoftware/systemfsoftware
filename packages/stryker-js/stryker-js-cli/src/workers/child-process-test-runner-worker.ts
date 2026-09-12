import { NodeFileSystem, NodePath, NodeSocketServer } from '@effect/platform-node'
import { errorToString } from '@systemfsoftware/stryker-js'
import type { PluginInit, StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import type { PluginContribution } from '@systemfsoftware/stryker-js/Plugin'
import type {
  CompleteDryRunResult,
  DryRunOptions,
  DryRunResult,
  MutantRunOptions,
  MutantRunResult,
  TestRunner,
  TestRunnerCapabilities,
  TestRunnerFailed,
} from '@systemfsoftware/stryker-js/TestRunner'
import { Match, Schema as S } from 'effect'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization'
import * as RpcServer from 'effect/unstable/rpc/RpcServer'

import { nodeModuleLayer } from '../platform/node.js'
import {
  create,
  decodeWorkerOptions,
  loadPlugins,
  MutantCoveragePayload,
  TestRunnerRpcs,
} from '../run/worker-wiring.js'
import { launchWorker, workerSocketPath } from './worker-runtime.js'

const NO_INIT: PluginInit = {}
const NO_CAPABILITIES: TestRunnerCapabilities = { reloadEnvironment: false }

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
    const decoded = yield* S.decodeUnknownEffect(S.optional(MutantCoveragePayload))(
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

const buildRunner = (contribution: PluginContribution<'TestRunner'>, options: StrykerOptions): TestRunner =>
  contribution.make(options, NO_INIT)

const TestRunnerHandlers = TestRunnerRpcs.toLayer(
  Effect.gen(function*() {
    const options = yield* readWorkerOptions
    const runnerName = options.testRunner
    const failed =
      (phase: 'capabilities' | 'dryRun' | 'init' | 'mutantRun') =>
      (cause: Cause.Cause<unknown>): Effect.Effect<never, TestRunnerFailed> =>
        Effect.fail({
          _tag: 'TestRunnerFailed',
          cause: Cause.pretty(cause),
          phase,
          runnerName,
        })

    const loaded = yield* loadPlugins(options.plugins, process.cwd()).pipe(
      Effect.catchCause(failed('init')),
    )
    const contribution = yield* create(loaded.pluginsByKind, 'TestRunner', runnerName).pipe(
      Effect.catchCause(failed('init')),
    )
    const underlying = yield* Effect.try({
      try: () => buildRunner(contribution, options),
      catch: (cause) => Cause.fail(cause),
    }).pipe(Effect.catchCause(failed('init')))
    yield* Effect.tryPromise({
      try: async () => underlying.init?.(),
      catch: (cause) => Cause.fail(cause),
    }).pipe(Effect.catchCause(failed('init')))
    yield* Effect.addFinalizer(() =>
      Effect.tryPromise({
        try: async () => underlying.dispose?.(),
        catch: (cause) => Cause.fail(cause),
      }).pipe(Effect.ignoreCause)
    )

    const capabilitiesOf = (): Promise<TestRunnerCapabilities> =>
      Promise.resolve(underlying.capabilities?.()).then((capabilities) => capabilities ?? NO_CAPABILITIES)

    return {
      capabilities: () =>
        Effect.tryPromise({
          try: capabilitiesOf,
          catch: (cause) => Cause.fail(cause),
        }).pipe(Effect.catchCause(failed('capabilities'))),

      dryRun: ({ options: runOptions }: { readonly options: DryRunOptions }) =>
        Effect.tryPromise({
          try: async () => {
            const run = underlying.dryRun
            if (run === undefined) {
              throw new Error(`TestRunner ${runnerName} does not expose a dryRun function`)
            }
            return await run(runOptions)
          },
          catch: (cause) => Cause.fail(cause),
        }).pipe(
          Effect.flatMap((result) => withCoverage(result, runOptions)),
          Effect.catchCause(failed('dryRun')),
        ),

      mutantRun: ({ options: runOptions }: { readonly options: MutantRunOptions }) =>
        Effect.tryPromise({
          try: async () => {
            const run = underlying.mutantRun
            if (run === undefined) {
              throw new Error(`TestRunner ${runnerName} does not expose a mutantRun function`)
            }
            return await run(runOptions)
          },
          catch: (cause) => Cause.fail(cause),
        }).pipe(
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
