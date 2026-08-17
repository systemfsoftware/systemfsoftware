import path from 'path'
import { fileURLToPath } from 'url'

import { CheckStatus } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { Context, Effect, Layer, Schema as S } from 'effect'

import { HybridFileSystem } from '../../src/project/hybrid-file-system.js'
import { TypescriptChecker } from '../../src/typescript-checker.js'
import { TypescriptCompiler } from '../../src/typescript-compiler.js'

import { CheckerOptionsWithPluginKeys } from './checker-options.schema.js'

export interface CheckerOptionsInput {
  readonly tsconfigFile: string
  readonly typescriptChecker?: {
    readonly prioritizePerformanceOverAccuracy?: boolean
  }
}

export interface CheckerHarness {
  readonly checker: TypescriptChecker
  readonly compiler: TypescriptCompiler | undefined
}

export class CheckerService extends Context.Service<CheckerService, CheckerHarness>()(
  '@systemfsoftware/stryker-js-typescript-checker/tests/__fixtures__/CheckerService',
) {}

/**
 * When the scenario needs an already-initialised checker over a fixture
 * project. The checker and its TS7 compiler are torn down when the scenario
 * ends, so each scenario observes a fresh project.
 */
export const checkerLayer = (
  tsconfigFile: string,
  logger: Logger = createLogger(),
): Layer.Layer<CheckerService, never, never> => makeCheckerLayer(tsconfigFile, logger, true)

/**
 * When the scenario must drive `init()` itself — the error-path feature,
 * whose initialization is expected to fail.
 */
export const uninitializedCheckerLayer = (
  tsconfigFile: string,
  logger: Logger = createLogger(),
): Layer.Layer<CheckerService, never, never> => makeCheckerLayer(tsconfigFile, logger, false)

const makeCheckerLayer = (
  tsconfigFile: string,
  logger: Logger,
  initialize: boolean,
): Layer.Layer<CheckerService, never, never> =>
  Layer.effect(
    CheckerService,
    Effect.acquireRelease(
      Effect.gen(function*() {
        const options = decodeCheckerOptions({
          tsconfigFile,
          typescriptChecker: { prioritizePerformanceOverAccuracy: true },
        })
        const fileSystem = new HybridFileSystem()
        const compiler = new TypescriptCompiler(logger, options, fileSystem)
        const checker = new TypescriptChecker(logger, options, compiler)
        if (initialize) {
          yield* Effect.promise(() => checker.init())
        }
        return { checker, compiler }
      }),
      (harness) =>
        Effect.sync(() => {
          harness.compiler?.close()
        }),
    ),
  )

export const decodeCheckerOptions = (input: CheckerOptionsInput): StrykerOptions =>
  S.decodeUnknownSync(CheckerOptionsWithPluginKeys)(input)

export const createLogger = (warn: Logger['warn'] = (): void => {}): Logger => ({
  isTraceEnabled: () => false,
  isDebugEnabled: () => false,
  isInfoEnabled: () => false,
  isWarnEnabled: () => false,
  isErrorEnabled: () => false,
  isFatalEnabled: () => false,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn,
  error: () => {},
  fatal: () => {},
})

export const checkMutants = (
  mutants: Mutant[],
): Effect.Effect<Record<string, CheckResult>, never, CheckerService> =>
  Effect.gen(function*() {
    const { checker } = yield* CheckerService
    return yield* Effect.promise(() => checker.check(mutants))
  })

export const groupMutants = (mutants: Mutant[]): Effect.Effect<string[][], never, CheckerService> =>
  Effect.gen(function*() {
    const { checker } = yield* CheckerService
    return yield* Effect.promise(() => checker.group(mutants))
  })

export type InitOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string }

export const observeInit: Effect.Effect<InitOutcome, never, CheckerService> = Effect.gen(function*() {
  const { checker } = yield* CheckerService
  return yield* Effect.promise(async (): Promise<InitOutcome> => {
    try {
      await checker.init()
      return { ok: true }
    } catch (caught) {
      return { ok: false, message: extractErrorMessage(caught) }
    }
  })
})

export const extractErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
    ? error
    : JSON.stringify(error) ?? 'a non-Error value was thrown'

export const initErrorMessage = (outcome: InitOutcome): string => {
  if (outcome.ok) {
    throw new Error('Expected initialisation to fail, but it succeeded')
  }
  return outcome.message
}

export const compileErrorReason = (result: CheckResult | undefined): string => {
  if (result === undefined || result.status !== CheckStatus.CompileError) {
    throw new Error(`Expected a CompileError verdict, got: ${JSON.stringify(result)}`)
  }
  return result.reason
}

const testsRoot = path.dirname(fileURLToPath(import.meta.url))

export const resolveTestResource = (...segments: string[]): string =>
  path.join(testsRoot, '..', '..', 'testResources', ...segments)

export interface MutantSeed {
  readonly fileName: string
  readonly content: string
  readonly findText: string
  readonly replacement: string
  readonly id?: string
  readonly offset?: number
}

export const createTextMutant = (seed: MutantSeed): Mutant => {
  const id = seed.id ?? '42'
  const lines = seed.content.split('\n')
  const lineNumber = lines.findIndex((line) => line.includes(seed.findText))
  if (lineNumber === -1) {
    throw new Error(`Cannot find ${seed.findText} in ${seed.fileName}`)
  }
  const line = lines[lineNumber]
  if (line === undefined) {
    throw new Error(`Line ${lineNumber} of ${seed.fileName} does not exist`)
  }
  const textColumn = line.indexOf(seed.findText) + (seed.offset ?? 0)
  return {
    id,
    fileName: seed.fileName,
    mutatorName: 'foo-mutator',
    location: {
      start: { line: lineNumber, column: textColumn },
      end: { line: lineNumber, column: textColumn + seed.findText.length },
    },
    replacement: seed.replacement,
  }
}

export { CheckStatus }
