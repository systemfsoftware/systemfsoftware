import { URL } from 'node:url'

import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { FileDescriptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'
import * as Scope from 'effect/Scope'

import type { LoggingServerAddress } from '../logging/index.js'
import { makeChildProcessProxy } from '../worker-pool/child-process-proxy.js'
import type { IdGenerator } from '../worker-pool/id-generator.js'
import { ChildProcessCrashedError } from '../worker-pool/worker-pool.schema.js'
import type { WorkerMethodError } from '../worker-pool/worker-protocol.schema.js'
import type { CheckerResourceService } from './checker-resource.js'

type CheckerWorkerShape = {
  init(options: StrykerOptions): Promise<void>
  check(...args: unknown[]): Promise<Record<string, CheckResult>>
  group(...args: unknown[]): Promise<readonly (readonly string[])[]>
}

export const makeCheckerChildProcess = (params: {
  readonly options: StrykerOptions
  readonly fileDescriptions: FileDescriptions
  readonly pluginModulePaths: readonly string[]
  readonly loggingServerAddress: LoggingServerAddress
  readonly workingDirectory: string
  readonly logger: Logger
  readonly execArgv: readonly string[]
  readonly idGenerator: IdGenerator
}): Effect.Effect<CheckerResourceService, unknown, Scope.Scope> =>
  Effect.gen(function*() {
    const shape = yield* makeChildProcessProxy<CheckerWorkerShape>({
      modulePath: new URL('./checker-worker.mjs', import.meta.url).pathname,
      namedExport: 'CheckerWorker',
      loggingServerAddress: params.loggingServerAddress,
      options: params.options,
      fileDescriptions: params.fileDescriptions,
      pluginModulePaths: [...params.pluginModulePaths],
      workingDirectory: params.workingDirectory,
      logger: params.logger,
      execArgv: [...params.execArgv],
      idGenerator: params.idGenerator,
    })
    yield* shape.proxy.init(params.options).pipe(
      Effect.catchTag('WorkerMethodError', (error: WorkerMethodError) =>
        Effect.fail(
          new ChildProcessCrashedError({
            pid: 0,
            exit: { _tag: 'Code', code: 1 },
            cause: error.message,
          }),
        )),
    )
    return {
      check: (checkerName, mutants) =>
        shape.proxy.check(checkerName, [...mutants]).pipe(
          Effect.catchTag('WorkerMethodError', (error: WorkerMethodError) =>
            Effect.fail(
              new ChildProcessCrashedError({
                pid: 0,
                exit: { _tag: 'Code', code: 1 },
                cause: error.message,
              }),
            )),
        ),
      group: (checkerName, mutants) =>
        shape.proxy.group(checkerName, [...mutants]).pipe(
          Effect.catchTag('WorkerMethodError', (error: WorkerMethodError) =>
            Effect.fail(
              new ChildProcessCrashedError({
                pid: 0,
                exit: { _tag: 'Code', code: 1 },
                cause: error.message,
              }),
            )),
        ),
    }
  })
