import {
  CoverageData,
  INSTRUMENTER_CONSTANTS,
  MutantCoverage,
  StrykerOptions,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import { errorToString, normalizeFileName } from '@systemfsoftware/stryker-js-plugin-api/core'
import {
  determineHitLimitReached,
  DryRunResult,
  DryRunStatus,
  TestRunner,
  TestStatus,
  toMutantRunResult,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { TestRunnerFailed } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { testFilesProvided } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as S from 'effect/Schema'
import { fileURLToPath } from 'url' // node:url — STRYKER_SETUP worker locator
import type { RunnerTestSuite } from 'vitest'
import type { Vitest } from 'vitest/node'
import { readSandboxSelfAliases, sandboxSelfPlugin } from './sandbox-self-aliases.js'
import { VitestSectionSchema } from './vitest-runner-options.schema.js'
import {
  collectTestsFromSuite,
  convertTestToTestResult,
  fromTestId,
  isErrorCodeError,
  normalizeCoverage,
  VITEST_ERROR_CODES,
} from './vitest-task-mapping.js'
import { resolveVitest, type VitestResolver } from './vitest-wrapper.js'

const isRunnerTestSuite = (value: unknown): value is RunnerTestSuite =>
  typeof value === 'object' &&
  value !== null &&
  'tasks' in value &&
  Array.isArray(Reflect.get(value, 'tasks'))

type StrykerNamespace = '__stryker__' | '__stryker2__'
const STRYKER_SETUP = fileURLToPath(
  new URL('./stryker-setup.mjs', import.meta.url),
)

export const shouldUseSuiteMetaSecondArg = (version: string): boolean => {
  const parts = version.split('.')
  const major = Number(parts[0] ?? '0')
  const minor = Number(parts[1] ?? '0')
  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return false
  }
  return major > 4 || (major === 4 && minor >= 1)
}

interface RunFilter {
  testIds?: string[]
  relatedFiles?: string[]
  testFiles?: string[]
}

interface RunnerState {
  ctx: Vitest | undefined
  localSetupFile: string | undefined
}

import {
  CoverageDecodeFailed,
  HitCountMetaSchema,
  MutantCoverageMetaSchema,
  MutantCoverageShapeSchema,
} from './vitest-runner-coverage.schema.js'

const experimentalStateGetFiles = (vitest: Vitest): readonly unknown[] => (vitest.state.getFiles())

const experimentalStateClearFiles = (vitest: unknown): void => {
  if (typeof vitest === 'object' && vitest !== null && 'state' in vitest) {
    const state = Reflect.get(vitest, 'state')
    if (typeof state === 'object' && state !== null && 'filesMap' in state) {
      const filesMap = Reflect.get(state, 'filesMap')
      if (filesMap instanceof Map) {
        filesMap.clear()
      } else if (typeof filesMap === 'object' && filesMap !== null && 'clear' in filesMap) {
        const clear = Reflect.get(filesMap, 'clear')
        if (typeof clear === 'function') {
          Reflect.apply(clear, filesMap, [])
        }
      }
    }
  }
}

const experimentalStateHasExternalErrors = (vitest: unknown): boolean => {
  if (typeof vitest === 'object' && vitest !== null && 'state' in vitest) {
    const state = Reflect.get(vitest, 'state')
    if (typeof state === 'object' && state !== null && 'errorsSet' in state) {
      const errorsSet = Reflect.get(state, 'errorsSet')
      if (errorsSet instanceof Set) {
        return errorsSet.size > 0
      }
      if (typeof errorsSet === 'object' && errorsSet !== null && 'size' in errorsSet) {
        const size = Reflect.get(errorsSet, 'size')
        return typeof size === 'number' ? size > 0 : false
      }
    }
  }
  return false
}

const experimentalStateGetExternalErrorText = (vitest: unknown): string => {
  if (typeof vitest === 'object' && vitest !== null && 'state' in vitest) {
    const state = Reflect.get(vitest, 'state')
    if (typeof state === 'object' && state !== null && 'errorsSet' in state) {
      const errorsSet = Reflect.get(state, 'errorsSet')
      if (errorsSet instanceof Set) {
        return [...errorsSet].map(errorToString).join('\n')
      }
      const isIterable = (value: unknown): value is Iterable<unknown> =>
        typeof value === 'object' &&
        value !== null &&
        Symbol.iterator in value &&
        typeof Reflect.get(value, Symbol.iterator) === 'function'
      if (isIterable(errorsSet)) {
        return [...errorsSet].map(errorToString).join('\n')
      }
    }
  }
  return ''
}

const applyRunFilterToConfig = (
  vitest: Vitest,
  options: { related: string[] | undefined; testNamePattern: RegExp | undefined },
): void => {
  Reflect.set(vitest.config, 'related', options.related)
  for (const project of vitest.projects) {
    Reflect.set(project.config, 'testNamePattern', options.testNamePattern)
  }
}

const applySetupFilesToProjects = (vitest: Vitest, localSetupFile: string): void => {
  const browser = Reflect.get(vitest.config, 'browser')
  if (typeof browser === 'object' && browser !== null) {
    Reflect.set(browser, 'screenshotFailures', false)
  }
  for (const project of vitest.projects) {
    const setupFilesRaw = Reflect.get(project.config, 'setupFiles')
    const files = Array.isArray(setupFilesRaw)
      ? setupFilesRaw.filter((x: unknown): x is string => typeof x === 'string')
      : []
    Reflect.set(project.config, 'setupFiles', [localSetupFile, ...files])
    const pBrowser = Reflect.get(project.config, 'browser')
    if (typeof pBrowser === 'object' && pBrowser !== null) {
      Reflect.set(pBrowser, 'screenshotFailures', false)
    }
  }
}

export interface VitestRunnerLayerInput {
  readonly options: StrykerOptions
  readonly sandboxDirectory: string
  /**
   * No `logger` member. A fiber inherits the run's logger, so `Effect.logDebug`
   * and friends reach it without this layer being handed one.
   */
  readonly globalNamespace?: StrykerNamespace
  readonly resolveVitestFor?: VitestResolver
  /**
   * Where the sandbox setup file is copied FROM.
   *
   * Defaults to `stryker-setup.mjs` beside this module's own emitted file,
   * which is the only correct answer for an installed package. A test that
   * imports this module from `src/` has no such sibling — the emitted `.mjs`
   * lives in `dist/` — so it passes the path instead of the product carrying
   * a branch for a layout only the test produces.
   */
  readonly setupFilePath?: string
}

export const makeVitestRunnerLayer = (
  input: VitestRunnerLayerInput,
): Layer.Layer<TestRunner, never, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    TestRunner,
    Effect.gen(function*() {
      const stateRef = yield* Ref.make<RunnerState>({ ctx: undefined, localSetupFile: undefined })
      const fsService = yield* FileSystem.FileSystem
      const pathService = yield* Path.Path
      const getState = Ref.get(stateRef)
      const requireCtx = Effect.gen(function*() {
        const state = yield* getState
        if (state.ctx === undefined) {
          return yield* new TestRunnerFailed({
            runnerName: 'vitest',
            phase: 'dryRun',
            cause: new Error('Vitest runner is not initialized; call init() before running tests'),
          })
        }
        return state.ctx
      })
      const decodedOptionsEffect = (raw: unknown) =>
        S.decodeUnknownEffect(VitestSectionSchema)(raw).pipe(
          Effect.map((decoded) => (decoded === undefined ? { related: true } : decoded)),
          Effect.mapError((cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause })),
        )
      const rawVitest = Reflect.get(input.options, 'vitest')
      const optionsEffect = decodedOptionsEffect(rawVitest).pipe(
        Effect.map((vitestOptions) => ({ ...input.options, vitest: vitestOptions })),
      )
      const capabilities: TestRunner['Service']['capabilities'] = Effect.succeed({ reloadEnvironment: true })
      const init: TestRunner['Service']['init'] = Effect.gen(function*() {
        const options = yield* optionsEffect
        yield* Effect.sync(() => {
          process.env.NODE_ENV = 'test'
          process.env.VITEST = '1'
        })
        const projectRoot = input.sandboxDirectory
        const localSetupFile = pathService.resolve(projectRoot, `stryker-setup-${process.pid}.js`)
        yield* Ref.update(stateRef, (s) => ({ ...s, localSetupFile }))
        yield* fsService.copyFile(input.setupFilePath ?? STRYKER_SETUP, localSetupFile).pipe(
          Effect.mapError((cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause })),
        )
        const resolver = input.resolveVitestFor ?? resolveVitest
        const { createVitest, version } = yield* Effect.tryPromise({
          try: () => resolver(projectRoot),
          catch: (cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause }),
        })
        const namespace = input.globalNamespace ?? INSTRUMENTER_CONSTANTS.NAMESPACE
        const scanDir = typeof options.vitest.dir === 'string'
          ? pathService.resolve(projectRoot, options.vitest.dir)
          : undefined
        const aliases = yield* readSandboxSelfAliases(projectRoot).pipe(
          Effect.provideService(FileSystem.FileSystem, fsService),
          Effect.provideService(Path.Path, pathService),
        )
        const plugin = sandboxSelfPlugin(aliases)
        const ctx = yield* Effect.tryPromise({
          try: () =>
            createVitest(
              'test',
              {
                config: options.vitest.configFile,
                coverage: { enabled: false },
                maxWorkers: 1,
                maxConcurrency: 1,
                watch: false,
                root: projectRoot,
                ...(scanDir === undefined ? {} : { dir: scanDir }),
                bail: options.disableBail ? 0 : 1,
                onConsoleLog: () => false,
              },
              {
                resolve: {
                  alias: [...aliases],
                  conditions: ['@systemfsoftware/source', 'import'],
                },
                plugins: [plugin],
              },
            ),
          catch: (cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause }),
        })
        ctx.provide('globalNamespace', namespace)
        ctx.provide('isGreaterThanVitest4Point1', shouldUseSuiteMetaSecondArg(version))
        applySetupFilesToProjects(ctx, localSetupFile)
        yield* Effect.logDebug(`vitest final config: ${JSON.stringify(ctx.config, null, 2)}`)
        yield* Ref.update(stateRef, (s) => ({ ...s, ctx }))
      }).pipe(Effect.mapError((cause) => (cause instanceof TestRunnerFailed
        ? cause
        : new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause }))
      ))
      const resetContext = Effect.gen(function*() {
        const ctx = yield* requireCtx
        experimentalStateClearFiles(ctx)
      })
      const getFileMeta = (file: unknown): unknown => {
        if (file !== null && typeof file === 'object' && 'meta' in file) {
          return Reflect.get(file, 'meta')
        }
        return undefined
      }
      const readHitCount: Effect.Effect<number, CoverageDecodeFailed> = Effect.gen(function*() {
        const ctx = yield* requireCtx.pipe(Effect.mapError((cause) => new CoverageDecodeFailed({ cause })))
        const files = experimentalStateGetFiles(ctx)
        let total = 0
        for (const file of files) {
          const meta = getFileMeta(file)
          const decoded = yield* S.decodeUnknownEffect(HitCountMetaSchema)(meta).pipe(
            Effect.mapError((cause) => new CoverageDecodeFailed({ cause })),
            Effect.orElseSucceed(() => ({ hitCount: undefined })),
          )
          if (decoded.hitCount !== undefined) {
            total += decoded.hitCount
          }
        }
        return total
      })
      const readMutantCoverage: Effect.Effect<MutantCoverage | undefined, CoverageDecodeFailed> = Effect.gen(
        function*() {
          const ctx = yield* requireCtx.pipe(Effect.mapError((cause) => new CoverageDecodeFailed({ cause })))
          const files = experimentalStateGetFiles(ctx)
          const deduped: Record<string, unknown> = {}
          for (const file of files) {
            const projectNameValue = typeof file === 'object' && file !== null && 'projectName' in file
              ? Reflect.get(file, 'projectName')
              : undefined
            const projectName = typeof projectNameValue === 'string' ? projectNameValue : ''
            const nameValue = typeof file === 'object' && file !== null && 'name' in file
              ? Reflect.get(file, 'name')
              : undefined
            const name = typeof nameValue === 'string' ? nameValue : ''
            const key = `${projectName}-${name}`
            deduped[key] = file
          }
          const coverages: MutantCoverage[] = []
          for (const file of Object.values(deduped)) {
            const rawMeta = getFileMeta(file)
            const decoded = yield* S.decodeUnknownEffect(MutantCoverageMetaSchema)(rawMeta).pipe(
              Effect.mapError((cause) => new CoverageDecodeFailed({ cause })),
              Effect.orElseSucceed(() => ({ mutantCoverage: undefined })),
            )
            if (decoded.mutantCoverage !== undefined) {
              const normalized = normalizeCoverage(decoded.mutantCoverage, input.sandboxDirectory, pathService)
              const validated = yield* S.decodeEffect(MutantCoverageShapeSchema)(normalized).pipe(
                Effect.mapError((cause) => new CoverageDecodeFailed({ cause })),
                Effect.map(() => normalized),
              )
              coverages.push(validated)
            }
          }
          if (coverages.length === 0) {
            return undefined
          }
          if (coverages.length === 1) {
            return coverages[0]
          }
          const first = coverages[0]
          if (first === undefined) {
            return undefined
          }
          return coverages.slice(1).reduce((acc, projectCoverage) => {
            for (const [testId, testCoverage] of Object.entries(projectCoverage.perTest)) {
              const existing = acc.perTest[testId]
              if (existing !== undefined) {
                mergeCoverage(existing, testCoverage)
              } else {
                acc.perTest[testId] = testCoverage
              }
            }
            mergeCoverage(acc.static, projectCoverage.static)
            return acc
          }, first)
        },
      )
      const run = (
        filter: RunFilter,
      ): Effect.Effect<DryRunResult, TestRunnerFailed> =>
        Effect.gen(function*() {
          const ctx = yield* requireCtx
          const options = yield* optionsEffect
          yield* resetContext.pipe(
            Effect.mapError((cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause })),
          )
          const vitestInRun = Reflect.get(options, 'vitest')
          const relatedValue = Reflect.get(vitestInRun, 'related')
          const related = relatedValue !== false && filter.relatedFiles !== undefined
            ? filter.relatedFiles.map(normalizeFileName)
            : undefined
          let testFilesToRun: string[] | undefined = filter.testFiles
          let pattern: RegExp | undefined
          if ((filter.testIds ?? []).length > 0) {
            const parsedTests = (filter.testIds ?? []).map(fromTestId)
            const regexTestNameFilter = parsedTests.map(({ test: name }) => RegExp.escape(name)).join('|')
            pattern = new RegExp(regexTestNameFilter)
            testFilesToRun = parsedTests.map(({ file }) => pathService.resolve(input.sandboxDirectory, file))
          }
          applyRunFilterToConfig(ctx, { related, testNamePattern: pattern })
          yield* Effect.tryPromise({
            try: () => ctx.start(testFilesToRun),
            catch: (cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause }),
          }).pipe(
            Effect.catchIf(
              (error: TestRunnerFailed) =>
                isErrorCodeError(error.cause) && error.cause.code === VITEST_ERROR_CODES.FILES_NOT_FOUND,
              () => Effect.void,
            ),
          )
          const allFiles = experimentalStateGetFiles(ctx)
          const tests = allFiles
            .flatMap((file) => (isRunnerTestSuite(file) ? collectTestsFromSuite(file) : []))
            .filter((test) => test.result !== undefined)
          let failure = false
          const testResults = tests.map((test) => {
            const testResult = convertTestToTestResult(test, input.sandboxDirectory, pathService)
            failure ||= testResult.status === TestStatus.Failed
            return testResult
          })
          if (!failure && experimentalStateHasExternalErrors(ctx)) {
            const errorText = experimentalStateGetExternalErrorText(ctx)
            return { status: DryRunStatus.Error, errorMessage: `An error occurred outside of a test run: ${errorText}` }
          }
          return { tests: testResults, status: DryRunStatus.Complete }
        })
      const dryRun: TestRunner['Service']['dryRun'] = (options) =>
        Effect.gen(function*() {
          const ctx = yield* requireCtx
          ctx.provide('mode', 'dry-run')
          const hasTestFiles = testFilesProvided(options)
          const testResult: DryRunResult = hasTestFiles
            ? yield* run({ testFiles: options.testFiles, relatedFiles: options.files })
            : yield* run({ relatedFiles: options.files })
          if (
            testResult.status === DryRunStatus.Complete &&
            testResult.tests.length === 0 &&
            (yield* optionsEffect).vitest.related !== false &&
            !options.testFiles
          ) {
            yield* Effect.logWarning(
              'Vitest failed to find test files related to mutated files. Either disable `vitest.related` or import your source files directly from your test files. See https://stryker-mutator.io/docs/stryker-js/troubleshooting/#vitest-failed-to-find-test-files-related-to-mutated-files',
            )
          }
          if (testResult.status === DryRunStatus.Complete) {
            const mutantCoverage = yield* readMutantCoverage.pipe(
              Effect.mapError((cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause })),
            )
            if (mutantCoverage === undefined) {
              return testResult
            }
            return { ...testResult, mutantCoverage }
          }
          return testResult
        }).pipe(Effect.mapError((cause) => (cause instanceof TestRunnerFailed
          ? cause
          : new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause }))
        ))
      const mutantRun: TestRunner['Service']['mutantRun'] = (options) =>
        Effect.gen(function*() {
          const ctx = yield* requireCtx
          ctx.provide('mode', 'mutant')
          ctx.provide('hitLimit', options.hitLimit)
          ctx.provide('mutantActivation', options.mutantActivation)
          ctx.provide('activeMutant', options.activeMutant.id)
          const dryRunResult = yield* run({ testIds: options.testFilter, relatedFiles: [options.sandboxFileName] })
          const hitCount = yield* readHitCount.pipe(
            Effect.mapError((cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'mutantRun', cause })),
          )
          const timeOut = determineHitLimitReached(hitCount, options.hitLimit)
          const effectiveResult = Option.isSome(timeOut) ? timeOut.value : dryRunResult
          const reportAllKillers = typeof input.options.disableBail === 'boolean' ? input.options.disableBail : false
          return toMutantRunResult(effectiveResult, reportAllKillers)
        }).pipe(Effect.mapError((cause) => (cause instanceof TestRunnerFailed
          ? cause
          : new TestRunnerFailed({ runnerName: 'vitest', phase: 'mutantRun', cause }))
        ))
      const dispose: TestRunner['Service']['dispose'] = Effect.gen(function*() {
        const state = yield* getState
        if (state.ctx !== undefined) {
          const localSetupFile = state.localSetupFile
          if (localSetupFile !== undefined) {
            state.ctx.onClose(() =>
              Effect.runPromise(
                fsService.remove(localSetupFile, { recursive: true, force: true }).pipe(
                  Effect.orElseSucceed(() => undefined),
                ),
              )
            )
          }
          const currentCtx = state.ctx
          yield* Effect.tryPromise({
            try: () => currentCtx.close(),
            catch: (cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'dispose', cause }),
          })
        }
      })
      return TestRunner.of({ capabilities, init, dryRun, mutantRun, dispose })
    }),
  )

function mergeCoverage(to: CoverageData, from: CoverageData): void {
  for (const [mutantId, hitCount] of Object.entries(from)) {
    const existing = to[mutantId]
    if (existing !== undefined) {
      to[mutantId] = existing + hitCount
    } else {
      to[mutantId] = hitCount
    }
  }
}
