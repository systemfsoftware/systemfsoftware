import { URL } from 'node:url'

import type { FileDescriptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import type {
  DryRunOptions,
  DryRunResult,
  MutantRunOptions,
  MutantRunResult,
  TestRunnerCapabilities,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { TestRunnerFailed } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import type * as Scope from 'effect/Scope'

import { type ChildProcessProxyError, makeChildProcessProxy } from '../worker-pool/child-process-proxy.js'
import type { IdGenerator } from '../worker-pool/id-generator.js'
import type { ChildProcessCrashedError, OutOfMemoryError } from '../worker-pool/worker-pool.schema.js'
import type { WorkerMethodError } from '../worker-pool/worker-protocol.schema.js'
type TestRunnerWorkerShape = {
  capabilities(): Promise<TestRunnerCapabilities>
  init(options: StrykerOptions): Promise<void>
  dispose(): Promise<void>
  dryRun(options: DryRunOptions): Promise<DryRunResult>
  mutantRun(options: MutantRunOptions): Promise<MutantRunResult>
}

type WorkerFailure = WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError

/** What one worker needs to be spawned. */
export interface ChildProcessTestRunnerParams {
  readonly options: StrykerOptions
  readonly fileDescriptions: FileDescriptions
  readonly sandboxWorkingDirectory: string
  readonly pluginModulePaths: readonly string[]
  readonly logger: Logger
  readonly idGenerator: IdGenerator
}

/** How a call on a pooled worker can fail. */
export type PooledTestRunnerError = TestRunnerFailed | ChildProcessCrashedError | OutOfMemoryError

/**
 * A test runner in a child process, whose calls can fail the way a child process
 * fails.
 *
 * Wider than `TestRunnerService` on purpose. That port's error channel is
 * `TestRunnerFailed`, which is right for a runner living in this process — but
 * folding a crash into it erases the tag a pool retires a worker on, so
 * `Pool.invalidate` could never fire and a dead worker would be handed out again.
 * A `WorkerMethodError` is the runner genuinely failing and does become a
 * `TestRunnerFailed`; a crash or an OOM is the worker dying, and stays itself.
 */
export interface PooledTestRunner {
  readonly capabilities: Effect.Effect<TestRunnerCapabilities, PooledTestRunnerError>
  readonly init: Effect.Effect<void, PooledTestRunnerError>
  readonly dryRun: (options: DryRunOptions) => Effect.Effect<DryRunResult, PooledTestRunnerError>
  readonly mutantRun: (options: MutantRunOptions) => Effect.Effect<MutantRunResult, PooledTestRunnerError>
}

const toRunnerFailure =
  (runnerName: string, phase: 'capabilities' | 'init' | 'dryRun' | 'mutantRun' | 'dispose') =>
  (error: WorkerFailure): PooledTestRunnerError =>
    Match.value(error).pipe(
      Match.tag('WorkerMethodError', (e) => new TestRunnerFailed({ runnerName, phase, cause: e.message })),
      Match.tag('ChildProcessCrashedError', (e): PooledTestRunnerError => e),
      Match.tag('OutOfMemoryError', (e): PooledTestRunnerError => e),
      Match.exhaustive,
    )

/**
 * A test runner that runs in a child process.
 *
 * Spawning happens **once**, here, and the child's teardown is a finalizer on the
 * scope this Effect is acquired in — which is the scope `Pool.make` opens for one
 * worker. So a worker lives as long as its pool slot, and each `dryRun` or
 * `mutantRun` only sends a message to a process that is already up.
 *
 * The scope boundary is the whole correctness question. Putting it inside each
 * method type-checks identically and spawns a Node process per mutant, which
 * makes the pool hold nothing and pays worker startup thousands of times.
 *
 * A failed spawn stays a typed failure rather than a defect, because
 * `Pool.invalidate` and the crash-retry combinator can only act on a failure they
 * can see.
 */
export const makeChildProcessTestRunner = (
  params: ChildProcessTestRunnerParams,
): Effect.Effect<PooledTestRunner, ChildProcessProxyError | PooledTestRunnerError, Scope.Scope> =>
  Effect.gen(function*() {
    const { proxy } = yield* makeChildProcessProxy<TestRunnerWorkerShape>({
      modulePath: new URL('./child-process-test-runner-worker.mjs', import.meta.url).pathname,
      namedExport: 'ChildProcessTestRunnerWorker',
      options: params.options,
      fileDescriptions: params.fileDescriptions,
      pluginModulePaths: [...params.pluginModulePaths],
      workingDirectory: params.sandboxWorkingDirectory,
      logger: params.logger,
      execArgv: [...(params.options.testRunnerNodeArgs ?? [])],
      idGenerator: params.idGenerator,
    })

    const runnerName = params.options.testRunner
    yield* proxy.init(params.options).pipe(Effect.mapError(toRunnerFailure(runnerName, 'init')))

    return {
      capabilities: proxy.capabilities().pipe(Effect.mapError(toRunnerFailure(runnerName, 'capabilities'))),
      init: Effect.void,
      dryRun: (options) => proxy.dryRun(options).pipe(Effect.mapError(toRunnerFailure(runnerName, 'dryRun'))),
      mutantRun: (options) => proxy.mutantRun(options).pipe(Effect.mapError(toRunnerFailure(runnerName, 'mutantRun'))),
    }
  })
