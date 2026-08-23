import { URL } from 'node:url'

import type { FileDescriptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import type {
  DryRunResult,
  MutantRunResult,
  TestRunnerCapabilities,
  TestRunnerService,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { TestRunnerFailed } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import type * as Scope from 'effect/Scope'

import type { LoggingServerAddress } from '../logging/index.js'
import { type ChildProcessProxyError, makeChildProcessProxy } from '../worker-pool/child-process-proxy.js'
import type { IdGenerator } from '../worker-pool/id-generator.js'
import type { ChildProcessCrashedError, OutOfMemoryError } from '../worker-pool/worker-pool.schema.js'
import type { WorkerMethodError } from '../worker-pool/worker-protocol.schema.js'

type TestRunnerWorkerShape = {
  capabilities(...args: unknown[]): Promise<TestRunnerCapabilities>
  init(...args: unknown[]): Promise<void>
  dispose(...args: unknown[]): Promise<void>
  dryRun(...args: unknown[]): Promise<DryRunResult>
  mutantRun(...args: unknown[]): Promise<MutantRunResult>
}

/** What one worker needs to be spawned. */
export interface ChildProcessTestRunnerParams {
  readonly options: StrykerOptions
  readonly fileDescriptions: FileDescriptions
  readonly sandboxWorkingDirectory: string
  readonly loggingServerAddress: LoggingServerAddress
  readonly pluginModulePaths: readonly string[]
  readonly logger: Logger
  readonly idGenerator: IdGenerator
}

type WorkerFailure = WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError

const toTestRunnerFailed = (
  runnerName: string,
  phase: 'dryRun' | 'mutantRun',
) =>
(error: WorkerFailure): TestRunnerFailed =>
  Match.value(error).pipe(
    Match.tag('WorkerMethodError', (e) => new TestRunnerFailed({ runnerName, phase, cause: e.message })),
    Match.tag('ChildProcessCrashedError', (e) => new TestRunnerFailed({ runnerName, phase, cause: e })),
    Match.tag('OutOfMemoryError', (e) => new TestRunnerFailed({ runnerName, phase, cause: e })),
    Match.exhaustive,
  )

/**
 * A test runner that runs in a child process.
 *
 * Spawning happens **once**, here, and the child's teardown is a finalizer on
 * the scope this Effect is acquired in — which is the scope `Pool.make` opens
 * for one worker. So a worker lives as long as its pool slot, and each
 * `dryRun`/`mutantRun` only sends a message to a process that is already up.
 *
 * The scope boundary is the whole correctness question here. Putting it inside
 * each method instead type-checks identically and spawns a Node process per
 * mutant, which makes the pool hold nothing and pays worker startup thousands
 * of times.
 *
 * A failed spawn stays a typed failure rather than a defect, because
 * `Pool.invalidate` and the crash-retry combinator can only act on a failure
 * they can see.
 */
export const makeChildProcessTestRunner = (
  params: ChildProcessTestRunnerParams,
): Effect.Effect<TestRunnerService, ChildProcessProxyError, Scope.Scope> =>
  Effect.gen(function*() {
    const { proxy } = yield* makeChildProcessProxy<TestRunnerWorkerShape>({
      modulePath: new URL('./child-process-test-runner-worker.mjs', import.meta.url).pathname,
      namedExport: 'ChildProcessTestRunnerWorker',
      loggingServerAddress: params.loggingServerAddress,
      options: params.options,
      fileDescriptions: params.fileDescriptions,
      pluginModulePaths: [...params.pluginModulePaths],
      workingDirectory: params.sandboxWorkingDirectory,
      logger: params.logger,
      execArgv: [...(params.options.testRunnerNodeArgs ?? [])],
      idGenerator: params.idGenerator,
    })

    const runnerName = params.options.testRunner

    return {
      capabilities: proxy.capabilities().pipe(
        Effect.mapError(toTestRunnerFailed(runnerName, 'dryRun')),
      ),
      init: proxy.init().pipe(Effect.mapError(toTestRunnerFailed(runnerName, 'dryRun'))),
      dryRun: (options) => proxy.dryRun(options).pipe(Effect.mapError(toTestRunnerFailed(runnerName, 'dryRun'))),
      mutantRun: (options) =>
        proxy.mutantRun(options).pipe(Effect.mapError(toTestRunnerFailed(runnerName, 'mutantRun'))),
      dispose: Effect.void,
    }
  })
