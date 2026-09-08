import { NodeFileSystem, NodePath, NodeSocketServer } from '@effect/platform-node'
import type { ContributionOf } from '@systemfsoftware/stryker-js/Plugin'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import type {
  DryRunOptions,
  DryRunResult,
  MutantRunOptions,
  MutantRunResult,
} from '@systemfsoftware/stryker-js/TestRunner'
import { TestRunner, TestRunnerFailed } from '@systemfsoftware/stryker-js/TestRunner'
import { Schema as S } from 'effect'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
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

interface ErrnoException extends Error {
  code?: string
  errno?: number
  path?: string
  syscall?: string
}

function isErrnoException(error: unknown): error is ErrnoException {
  if (!(error instanceof Error)) {
    return false
  }
  if (!('code' in error)) {
    return false
  }
  const code: unknown = Reflect.get(error, 'code')
  return typeof code === 'string'
}

const isEmptyError = (error: unknown): boolean => {
  if (error === undefined || error === null) {
    return true
  }
  if (typeof error === 'string' && error.length === 0) {
    return true
  }
  if (error === 0 || error === false) {
    return true
  }
  if (typeof error === 'number' && Number.isNaN(error)) {
    return true
  }
  return false
}

const formatErrnoException = (error: ErrnoException): string => {
  const stack = error.stack
  if (stack !== undefined && stack.length > 0) {
    return `${error.name}: ${error.code} (${error.syscall}) ${stack}`
  }
  return `${error.name}: ${error.code} (${error.syscall})`
}

const formatError = (error: Error): string => {
  const message = `${error.name}: ${error.message}`
  if (error.stack !== undefined && error.stack.length > 0) {
    return `${message}\n${error.stack.toString()}`
  }
  return message
}

const stringifyNonError = (error: unknown): string => {
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return JSON.stringify(error)
  }
  try {
    const json = JSON.stringify(error)
    if (typeof json === 'string' && json.length > 0) {
      return json
    }
  } catch {
    // fall through
  }
  if (typeof error === 'object' && error !== null && 'toString' in error) {
    const toStringValue: unknown = Reflect.get(error, 'toString')
    if (typeof toStringValue === 'function') {
      try {
        const text: unknown = Reflect.apply(toStringValue, error, [])
        if (typeof text === 'string' && text.length > 0 && text !== '[object Object]') {
          return text
        }
      } catch {
        // fall through
      }
    }
  }
  return ''
}

function errorToString(error: unknown): string {
  if (isEmptyError(error)) {
    return ''
  }
  if (error instanceof Error) {
    if (isErrnoException(error)) {
      return formatErrnoException(error)
    }
    return formatError(error)
  }
  return stringifyNonError(error)
}

const buildTestRunner = (
  contribution: ContributionOf<'TestRunner'>,
  options: StrykerOptions,
): Effect.Effect<TestRunner['Service'], unknown, never> =>
  TestRunner.pipe(
    Effect.provide(
      contribution.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(RunConfiguration, options),
            Layer.succeed(SandboxDirectory, process.cwd()),
            NodeFileSystem.layer,
            NodePath.layer,
            nodeModuleLayer,
          ),
        ),
      ),
    ),
  )

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
      (phase: 'capabilities' | 'connect' | 'dryRun' | 'mutantRun') =>
      (cause: Cause.Cause<unknown>): Effect.Effect<never, TestRunnerFailed> =>
        Effect.fail(new TestRunnerFailed({ cause: Cause.pretty(cause), phase, runnerName }))

    const loaded = yield* loadPlugins(options.plugins, process.cwd()).pipe(
      Effect.catchCause(failed('connect')),
    )
    const underlying = yield* create(loaded.pluginsByKind, 'TestRunner', runnerName).pipe(
      Effect.flatMap((contribution) => buildTestRunner(contribution, options)),
      Effect.catchCause(failed('connect')),
    )

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
).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, nodeModuleLayer)))

const MainLayer = RpcServer.layer(TestRunnerRpcs).pipe(
  Layer.provide(TestRunnerHandlers),
  Layer.provide(RpcServer.layerProtocolSocketServer),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeSocketServer.layer({ path: workerSocketPath('test runner worker') })),
  Layer.provide(nodeModuleLayer),
)

launchWorker(MainLayer, 'test runner worker')
