/**
 * Runner — the vitest test-runner capability.
 *
 * Wraps Vitest's node API as an Effect `TestRunner` service: start/close
 * lifecycle, dry/mutant execution with Cell pipelines, coverage collection,
 * and sandbox self-alias resolution. Pure result mapping is delegated to
 * `VitestDryRun.workflow.ts` and `VitestMutantRun.workflow.ts`; schema
 * declarations live in `Runner.schema.ts`.
 */
import type * as PathType from 'effect/Path'
import type { RunMode, RunnerTestCase, RunnerTestSuite, TaskState } from 'vitest'
import { createVitest as createVitestOriginal } from 'vitest/node'
import type { Vitest } from 'vitest/node'

import { Cell } from '@systemfsoftware/effect-cell-types'
import { Module } from '@systemfsoftware/stryker-js/Module'
import {
  type CoverageData,
  errorToString,
  INSTRUMENTER_CONSTANTS,
  normalizeFileName,
} from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import {
  type BaseTestResult,
  type DryRunOptions,
  DryRunResult,
  type MutantCoverage as DryRunMutantCoverage,
  type MutantRunOptions,
  MutantRunResult,
  testFilesProvided,
  type TestResult,
  TestRunner,
  TestRunnerFailed,
  TestStatus,
} from '@systemfsoftware/stryker-js/TestRunner'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  CoverageDecodeFailed,
  ExportEntry,
  HitCountMetaSchema,
  MutantCoverageMetaSchema,
  MutantCoverageShapeSchema,
  PackageManifest,
  VitestNodeModuleSchema,
  VitestPackageSchema,
  VitestSectionSchema,
} from './Runner.schema.js'
import { VitestDryRunCommand, vitestDryRunWorkflow } from './VitestDryRun.workflow.js'
import type { VitestDryRunError, VitestDryRunOutput } from './VitestDryRun.workflow.js'
import { VitestMutantRunCommand, vitestMutantRunWorkflow } from './VitestMutantRun.workflow.js'
import type { VitestMutantRunError, VitestMutantRunOutput } from './VitestMutantRun.workflow.js'

// ---------------------------------------------------------------------------
// Test identity (from test-identity.ts) — also duplicated in stryker-setup.ts
// which is copied verbatim into the sandbox and cannot import siblings.
// ---------------------------------------------------------------------------

export function collectTestName({ name, suite }: { name: string; suite?: RunnerTestSuite }): string {
  const nameParts = [name]
  let currentSuite = suite
  while (currentSuite) {
    nameParts.unshift(currentSuite.name)
    currentSuite = currentSuite.suite
  }
  return nameParts.join(' ').trim()
}

export function toRawTestId(test: RunnerTestCase): string {
  return `${test.file.filepath}#${collectTestName(test)}`
}

// ---------------------------------------------------------------------------
// Task mapping (from vitest-task-mapping.ts)
// ---------------------------------------------------------------------------

function convertTaskStateToTestStatus(taskState: TaskState | undefined, testMode: RunMode): TestStatus {
  if (testMode === 'skip') return 'skipped'
  switch (taskState) {
    case 'pass':
      return 'success'
    case 'fail':
      return 'failed'
    case 'skip':
    case 'todo':
      return 'skipped'
    case undefined:
    case 'queued':
    case 'run':
    case 'only':
      return 'failed'
  }
  return 'failed'
}

export function convertTestToTestResult(test: RunnerTestCase, projectRoot: string, pathService: Path.Path): TestResult {
  const status = convertTaskStateToTestStatus(test.result?.state, test.mode)
  const baseTestResult: BaseTestResult = {
    id: normalizeTestId(toRawTestId(test), projectRoot, pathService),
    name: collectTestName(test),
    timeSpentMs: test.result?.duration ?? 0,
    fileName: pathService.resolve(test.file.filepath),
  }
  if (status === 'failed') {
    return {
      ...baseTestResult,
      status,
      failureMessage: test.result?.errors?.[0]?.message ?? 'StrykerJS: Unknown test failure',
    }
  }
  if (status === 'skipped') {
    const suiteError = findSuiteError(test.suite)
    if (suiteError !== undefined && suiteError.length > 0) {
      return { ...baseTestResult, status: 'failed', failureMessage: suiteError }
    }
  }
  return { ...baseTestResult, status }
}

function findSuiteError(suite: RunnerTestSuite | undefined): string | undefined {
  if (suite === undefined) return undefined
  if (suite.result !== undefined && suite.result.state === 'fail') {
    const message = suite.result.errors?.[0]?.message
    if (message !== undefined) return message
    return 'StrykerJS: Suite execution failed'
  }
  return findSuiteError(suite.suite)
}

export function fromTestId(id: string): { file: string; test: string } {
  const [file, ...name] = id.split('#')
  return { file, test: name.join('#') }
}

export function normalizeTestId(id: string, projectRoot: string, pathService: Path.Path): string {
  const { file, test } = fromTestId(id)
  return `${normalizeFileName(pathService.relative(projectRoot, file))}#${test}`
}

export function normalizeCoverage(
  rawCoverage: DryRunMutantCoverage,
  projectRoot: string,
  pathService: Path.Path,
): DryRunMutantCoverage {
  return {
    perTest: Object.fromEntries(
      Object.entries(rawCoverage.perTest).map((
        [rawTestId, coverageData],
      ) => [normalizeTestId(rawTestId, projectRoot, pathService), coverageData]),
    ),
    static: rawCoverage.static,
  }
}

export function collectTestsFromSuite(suite: RunnerTestSuite): RunnerTestCase[] {
  return suite.tasks.flatMap((task) => {
    if (task.type === 'suite') return collectTestsFromSuite(task satisfies RunnerTestSuite)
    return task satisfies RunnerTestCase
  })
}

export function isErrorCodeError(error: unknown): error is Error & { code: string } {
  if (error instanceof Error && 'code' in error) {
    const code = Reflect.get(error, 'code')
    return typeof code === 'string'
  }
  return false
}

/** @see https://github.com/vitest-dev/vitest/blob/main/packages/vitest/src/node/errors.ts */
export const VITEST_ERROR_CODES = Object.freeze({ FILES_NOT_FOUND: 'VITEST_FILES_NOT_FOUND' })

// ---------------------------------------------------------------------------
// Sandbox self-aliases (from sandbox-self-aliases.ts)
// ---------------------------------------------------------------------------

export const SOURCE_CONDITION = '@systemfsoftware/source'

const sourceTargetOf = (entry: ExportEntry): string | undefined => {
  if (typeof entry === 'string') {
    return (() => {
      if (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.mts')) return entry
      return undefined
    })()
  }
  const source = (entry satisfies Record<string, unknown>)[SOURCE_CONDITION]
  return (() => {
    if (typeof source === 'string') return source
    return undefined
  })()
}

const specifierForExport = (packageName: string, exportKey: string): string | undefined => {
  if (exportKey === '.') return packageName
  if (exportKey === './package.json' || !exportKey.startsWith('./')) return undefined
  return `${packageName}/${exportKey.slice(2)}`
}

export const sandboxSelfAliases = (
  manifest: PackageManifest,
  projectRoot: string,
  pathService: PathType.Path,
): readonly SandboxAlias[] => {
  const name = manifest.name
  const exports = manifest.exports
  if (name === undefined || name.length === 0 || exports === undefined) return []
  const aliases: SandboxAlias[] = []
  for (const [key, value] of Object.entries(exports)) {
    const spec = specifierForExport(name, key)
    const target = sourceTargetOf(value satisfies ExportEntry)
    if (spec === undefined || target === undefined) continue
    aliases.push({
      find: new RegExp(`^${RegExp.escape(spec)}$`),
      replacement: pathService.resolve(projectRoot, target),
    })
  }
  return aliases
}

export interface SandboxAlias {
  readonly find: RegExp
  readonly replacement: string
}

export const readSandboxSelfAliases = (
  projectRoot: string,
): Effect.Effect<readonly SandboxAlias[], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    const raw = yield* fs.readFileString(pathService.join(projectRoot, 'package.json')).pipe(
      Effect.orElseSucceed(() => null satisfies string | null),
    )
    if (raw === null) return [] satisfies readonly SandboxAlias[]
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return [] satisfies readonly SandboxAlias[]
    }
    return Option.match(S.decodeUnknownOption(PackageManifest)(parsed), {
      onNone: () => [] satisfies readonly SandboxAlias[],
      onSome: (manifest) => sandboxSelfAliases(manifest, projectRoot, pathService),
    })
  })

/**
 * Vite records a package specifier as a bare dep. Vitest related-mode then
 * joins that specifier onto the project root, misses the file, and reports
 * zero tests. Returning the sandbox source path from `resolveId` makes the
 * dep a real filesystem path related-mode can walk.
 */
export const sandboxSelfPlugin = (
  aliases: readonly SandboxAlias[],
): { readonly name: string; readonly enforce: 'pre'; readonly resolveId: (source: string) => string | undefined } => ({
  name: 'stryker-sandbox-self-exports',
  enforce: 'pre',
  resolveId(source: string): string | undefined {
    for (const alias of aliases) if (alias.find.test(source)) return alias.replacement
    return undefined
  },
})

// ---------------------------------------------------------------------------
// Vitest resolver (from vitest-wrapper.ts)
// ---------------------------------------------------------------------------

export interface ResolvedVitest {
  createVitest: typeof createVitestOriginal
  version: string
}
export type VitestResolver = (
  _dir: string,
) => Effect.Effect<ResolvedVitest, never, Module | FileSystem.FileSystem | Path.Path>

const isRunnerTestSuite = (value: unknown): value is RunnerTestSuite =>
  typeof value === 'object' && value !== null && 'tasks' in value && Array.isArray(Reflect.get(value, 'tasks'))

type StrykerNamespace = '__stryker__' | '__stryker2__'
const STRYKER_SETUP_URL = new URL('./stryker-setup.mjs', import.meta.url)

export const resolveVitest: VitestResolver = (_dir) =>
  Effect.gen(function*() {
    const fallback = Effect.gen(function*() {
      const pathService = yield* Path.Path
      const fs = yield* FileSystem.FileSystem
      const urlString: string = import.meta.resolve('vitest/package.json')
      const packageJsonPath = yield* pathService.fromFileUrl(new URL(urlString))
      const content = yield* fs.readFileString(packageJsonPath)
      const parsed: unknown = JSON.parse(content)
      const decoded = yield* S.decodeUnknownEffect(VitestPackageSchema)(parsed)
      return { createVitest: createVitestOriginal, version: decoded.version } satisfies ResolvedVitest
    }).pipe(Effect.orDie)
    const primary = Effect.gen(function*() {
      const module = yield* Module
      const pathService = yield* Path.Path
      const fs = yield* FileSystem.FileSystem
      const requireFromProject = module.createRequire(pathService.join(_dir, 'package.json'))
      const imported: unknown = requireFromProject('vitest/node')
      const decodedNode = yield* S.decodeUnknownEffect(VitestNodeModuleSchema)(imported)
      const packageJsonPath = requireFromProject.resolve('vitest/package.json')
      const content = yield* fs.readFileString(packageJsonPath)
      const parsed: unknown = JSON.parse(content)
      const decodedPackage = yield* S.decodeUnknownEffect(VitestPackageSchema)(parsed)
      return {
        createVitest: decodedNode.createVitest,
        version: decodedPackage.version,
      } satisfies ResolvedVitest
    })
    return yield* primary.pipe(Effect.catchCause(() => fallback), Effect.catchDefect(() => fallback))
  }).pipe(Effect.orDie)

export const shouldUseSuiteMetaSecondArg = (version: string): boolean => {
  const parts = version.split('.')
  const major = Number(parts[0] ?? '0')
  const minor = Number(parts[1] ?? '0')
  if (Number.isNaN(major) || Number.isNaN(minor)) return false
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

const experimentalStateGetFiles = (vitest: Vitest): readonly unknown[] =>
  vitest.state.getFiles() satisfies readonly unknown[]

const experimentalStateClearFiles = (vitest: unknown): void => {
  if (typeof vitest === 'object' && vitest !== null && 'state' in vitest) {
    const state = Reflect.get(vitest, 'state')
    if (typeof state === 'object' && state !== null && 'filesMap' in state) {
      const filesMap = Reflect.get(state, 'filesMap')
      if (filesMap instanceof Map) filesMap.clear()
      else if (typeof filesMap === 'object' && filesMap !== null && 'clear' in filesMap) {
        const clear = Reflect.get(filesMap, 'clear')
        if (typeof clear === 'function') Reflect.apply(clear, filesMap, [])
      }
    }
  }
}

const experimentalStateHasExternalErrors = (vitest: unknown): boolean => {
  if (typeof vitest === 'object' && vitest !== null && 'state' in vitest) {
    const state = Reflect.get(vitest, 'state')
    if (typeof state === 'object' && state !== null && 'errorsSet' in state) {
      const errorsSet = Reflect.get(state, 'errorsSet')
      if (errorsSet instanceof Set) return errorsSet.size > 0
      if (typeof errorsSet === 'object' && errorsSet !== null && 'size' in errorsSet) {
        const size = Reflect.get(errorsSet, 'size')
        return (() => {
          if (typeof size === 'number') return size > 0
          return false
        })()
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
      if (errorsSet instanceof Set) return [...errorsSet].map(errorToString).join('\n')
      const isIterable = (value: unknown): value is Iterable<unknown> =>
        typeof value === 'object' && value !== null && Symbol.iterator in value &&
        typeof Reflect.get(value, Symbol.iterator) === 'function'
      if (isIterable(errorsSet)) return [...errorsSet].map(errorToString).join('\n')
    }
  }
  return ''
}

const applyRunFilterToConfig = (
  vitest: Vitest,
  options: { related: string[] | undefined; testNamePattern: RegExp | undefined },
): void => {
  Reflect.set(vitest.config, 'related', options.related)
  for (const project of vitest.projects) Reflect.set(project.config, 'testNamePattern', options.testNamePattern)
}

const applySetupFilesToProjects = (vitest: Vitest, localSetupFile: string): void => {
  const browser: unknown = Reflect.get(vitest.config, 'browser')
  if (typeof browser === 'object' && browser !== null) {
    Reflect.set(browser satisfies object, 'screenshotFailures', false)
  }
  for (const project of vitest.projects) {
    const setupFilesRaw = Reflect.get(project.config, 'setupFiles')
    const files = (() => {
      if (Array.isArray(setupFilesRaw)) return setupFilesRaw.filter((x: unknown): x is string => typeof x === 'string')
      return []
    })()
    Reflect.set(project.config, 'setupFiles', [localSetupFile, ...files])
    const pBrowser: unknown = Reflect.get(project.config, 'browser')
    if (typeof pBrowser === 'object' && pBrowser !== null) {
      Reflect.set(pBrowser satisfies object, 'screenshotFailures', false)
    }
  }
}

export interface VitestRunnerLayerInput {
  readonly options: StrykerOptions
  readonly sandboxDirectory: string
  readonly globalNamespace?: StrykerNamespace
  readonly resolveVitestFor?: VitestResolver
  readonly setupFilePath?: string
}

export const makeVitestRunnerLayer = (
  input: VitestRunnerLayerInput,
): Layer.Layer<TestRunner, never, Module | FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    TestRunner,
    Effect.gen(function*() {
      const stateRef = yield* Ref.make<RunnerState>({ ctx: undefined, localSetupFile: undefined })
      const fsService = yield* FileSystem.FileSystem
      const pathService = yield* Path.Path
      const moduleService = yield* Module
      const getState = Ref.get(stateRef)
      const requireCtx = Effect.gen(function*() {
        const state = yield* getState
        if (state.ctx === undefined) {
          return yield* new TestRunnerFailed({
            runnerName: 'vitest',
            phase: 'dryRun',
            cause: errorToString(new Error('Vitest runner is not initialized; call init() before running tests')),
          })
        }
        return state.ctx
      })
      const decodedOptionsEffect = (raw: unknown) =>
        S.decodeUnknownEffect(VitestSectionSchema)(raw).pipe(
          Effect.map((decoded) => ((() => {
            if (decoded === undefined) return { related: true }
            return decoded
          })())),
          Effect.mapError((cause) =>
            new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause: errorToString(cause) })
          ),
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
        const defaultSetupPath = yield* pathService.fromFileUrl(STRYKER_SETUP_URL).pipe(
          Effect.mapError((cause) =>
            new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause: errorToString(cause) })
          ),
        )
        yield* fsService.copyFile(input.setupFilePath ?? defaultSetupPath, localSetupFile).pipe(
          Effect.mapError((cause) =>
            new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause: errorToString(cause) })
          ),
        )
        const resolver = input.resolveVitestFor ?? resolveVitest
        const { createVitest, version } = yield* resolver(projectRoot).pipe(
          Effect.provideService(Module, moduleService),
          Effect.provideService(FileSystem.FileSystem, fsService),
          Effect.provideService(Path.Path, pathService),
          Effect.catchDefect((cause) =>
            Effect.fail(new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause: errorToString(cause) }))
          ),
        )
        const namespace = input.globalNamespace ?? INSTRUMENTER_CONSTANTS.NAMESPACE
        const scanDir = (() => {
          if (typeof options.vitest.dir === 'string') return pathService.resolve(projectRoot, options.vitest.dir)
          return undefined
        })()
        const aliases = yield* readSandboxSelfAliases(projectRoot).pipe(
          Effect.provideService(FileSystem.FileSystem, fsService),
          Effect.provideService(Path.Path, pathService),
        )
        const plugin = sandboxSelfPlugin(aliases)
        const ctx = yield* Effect.tryPromise({
          try: () =>
            createVitest('test', {
              config: options.vitest.configFile,
              coverage: { enabled: false },
              maxWorkers: 1,
              maxConcurrency: 1,
              watch: false,
              root: projectRoot,
              ...((() => {
                if (scanDir === undefined) return {}
                return { dir: scanDir }
              })()),
              bail: (() => {
                if (options.disableBail) return 0
                return 1
              })(),
              onConsoleLog: () => false,
              silent: true,
              reporters: [{ onInit(_vitest: Vitest) {} }],
            }, {
              resolve: { alias: [...aliases], conditions: ['@systemfsoftware/source', 'import'] },
              plugins: [plugin],
            }),
          catch: (cause) => new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause: errorToString(cause) }),
        })
        ctx.provide('globalNamespace', namespace)
        ctx.provide('isGreaterThanVitest4Point1', shouldUseSuiteMetaSecondArg(version))
        applySetupFilesToProjects(ctx, localSetupFile)
        yield* Ref.update(stateRef, (s) => ({ ...s, ctx }))
      }).pipe(Effect.mapError((cause) => ((() => {
        if (cause instanceof TestRunnerFailed) return cause
        return new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause: errorToString(cause) })
      })())))
      const resetContext = Effect.gen(function*() {
        const ctx = yield* requireCtx
        experimentalStateClearFiles(ctx)
      })
      const getFileMeta = (
        file: unknown,
      ): unknown => ((() => {
        if (file !== null && typeof file === 'object' && 'meta' in file) return Reflect.get(file, 'meta')
        return undefined
      })())
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
          if (decoded.hitCount !== undefined) total += decoded.hitCount
        }
        return total
      })
      const readMutantCoverage: Effect.Effect<DryRunMutantCoverage | undefined, CoverageDecodeFailed> = Effect.gen(
        function*() {
          const ctx = yield* requireCtx.pipe(Effect.mapError((cause) => new CoverageDecodeFailed({ cause })))
          const files = experimentalStateGetFiles(ctx)
          const deduped: Record<string, unknown> = {}
          for (const file of files) {
            const projectNameValue = (() => {
              if (typeof file === 'object' && file !== null && 'projectName' in file) {
                return Reflect.get(file, 'projectName')
              }
              return undefined
            })()
            const projectName = (() => {
              if (typeof projectNameValue === 'string') return projectNameValue
              return ''
            })()
            const nameValue = (() => {
              if (typeof file === 'object' && file !== null && 'name' in file) return Reflect.get(file, 'name')
              return undefined
            })()
            const name = (() => {
              if (typeof nameValue === 'string') return nameValue
              return ''
            })()
            deduped[`${projectName}-${name}`] = file
          }
          const coverages: DryRunMutantCoverage[] = []
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
          if (coverages.length === 0) return undefined
          if (coverages.length === 1) return coverages[0]
          const first = coverages[0]
          return coverages.slice(1).reduce((acc, projectCoverage) => {
            for (const [testId, testCoverage] of Object.entries(projectCoverage.perTest)) {
              if (testId in acc.perTest) mergeCoverage(acc.perTest[testId], testCoverage)
              else acc.perTest[testId] = testCoverage
            }
            mergeCoverage(acc.static, projectCoverage.static)
            return acc
          }, first)
        },
      )
      const collectRaw = (
        filter: RunFilter,
      ): Effect.Effect<
        { rawTests: unknown[]; hasExternalError: boolean; externalErrorText: string },
        TestRunnerFailed
      > =>
        Effect.gen(function*() {
          const ctx = yield* requireCtx
          const options = yield* optionsEffect
          yield* resetContext.pipe(
            Effect.mapError((cause) =>
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) })
            ),
          )
          const vitestInRun = Reflect.get(options, 'vitest')
          const relatedValue = Reflect.get(vitestInRun satisfies object, 'related')
          const related: string[] | undefined = (() => {
            if (relatedValue !== false && filter.relatedFiles !== undefined) {
              return filter.relatedFiles.map(normalizeFileName)
            }
            return undefined
          })()
          let testFilesToRun: string[] | undefined = (() => {
            if (filter.testFiles !== undefined) return [...filter.testFiles]
            return undefined
          })()
          let pattern: RegExp | undefined
          if ((filter.testIds ?? []).length > 0) {
            const parsedTests = (filter.testIds ?? []).map(fromTestId)
            pattern = new RegExp(parsedTests.map(({ test: name }) => RegExp.escape(name)).join('|'))
            testFilesToRun = parsedTests.map(({ file }) => pathService.resolve(input.sandboxDirectory, file))
          }
          applyRunFilterToConfig(ctx, { related, testNamePattern: pattern })
          yield* Effect.tryPromise({
            try: () => ctx.start(testFilesToRun),
            catch: (cause) =>
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) }),
          }).pipe(
            Effect.catchIf(
              (error: TestRunnerFailed) =>
                isErrorCodeError(error.cause) && typeof error.cause === 'string' &&
                error.cause.includes(VITEST_ERROR_CODES.FILES_NOT_FOUND),
              () => Effect.void,
            ),
          )
          const allFiles = experimentalStateGetFiles(ctx)
          const rawTests = allFiles.flatMap((
            file,
          ) => ((() => {
            if (isRunnerTestSuite(file)) return collectTestsFromSuite(file satisfies RunnerTestSuite)
            return []
          })())).filter((test) => (test satisfies RunnerTestCase).result !== undefined)
          const hasExternalError = experimentalStateHasExternalErrors(ctx)
          const externalErrorText = (() => {
            if (hasExternalError) return experimentalStateGetExternalErrorText(ctx)
            return ''
          })()
          return { rawTests, hasExternalError, externalErrorText }
        })
      interface DryRunPhases extends Cell.Phases {
        readonly command: DryRunOptions
        readonly raw: {
          readonly rawTests: readonly unknown[]
          readonly projectRoot: string
          readonly hasExternalError: boolean
          readonly externalErrorText: string
        }
        readonly decoded: VitestDryRunCommand
        readonly decision: VitestDryRunOutput
        readonly decisionError: VitestDryRunError
        readonly output: DryRunResult
        readonly response: DryRunResult
        readonly decodeError: unknown
        readonly readError: TestRunnerFailed
        readonly writeError: TestRunnerFailed
      }

      interface MutantRunPhases extends Cell.Phases {
        readonly command: MutantRunOptions
        readonly raw: {
          readonly rawTests: readonly unknown[]
          readonly projectRoot: string
          readonly hasExternalError: boolean
          readonly externalErrorText: string
          readonly hitCount?: number | undefined
          readonly hitLimit: number | undefined
          readonly reportAllKillers: boolean
        }
        readonly decoded: VitestMutantRunCommand
        readonly decision: VitestMutantRunOutput
        readonly decisionError: VitestMutantRunError
        readonly output: MutantRunResult
        readonly response: MutantRunResult
        readonly decodeError: unknown
        readonly readError: TestRunnerFailed
        readonly writeError: TestRunnerFailed
      }
      const dryRunDescription: Cell.WriteDone<DryRunPhases> = pipe(
        Cell.read<DryRunPhases>((command) =>
          Effect.gen(function*() {
            const ctx = yield* requireCtx
            ctx.provide('mode', 'dry-run')
            const hasTestFiles = testFilesProvided(command)
            const filter: RunFilter = (() => {
              if (hasTestFiles) {
                return {
                  testFiles: [...(command.testFiles ?? [])],
                  relatedFiles: (() => {
                    if (command.files !== undefined) return [...command.files]
                    return undefined
                  })(),
                }
              }
              return {
                relatedFiles: (() => {
                  if (command.files !== undefined) return [...command.files]
                  return undefined
                })(),
              }
            })()
            const { rawTests, hasExternalError, externalErrorText } = yield* collectRaw(filter satisfies RunFilter)
            return { rawTests, projectRoot: input.sandboxDirectory, hasExternalError, externalErrorText }
          })
        ),
        Cell.decode<DryRunPhases>((raw) =>
          Result.succeed(
            new VitestDryRunCommand({
              rawTests: raw.rawTests,
              projectRoot: raw.projectRoot,
              hasExternalError: raw.hasExternalError,
              externalErrorText: raw.externalErrorText,
            }),
          )
        ),
        Cell.decide<DryRunPhases>(vitestDryRunWorkflow),
        Cell.encode<DryRunPhases>((outcome) =>
          Result.match(outcome, {
            onFailure: (e) => ({ status: 'error' as const, errorMessage: e.message }) satisfies DryRunResult,
            onSuccess: (out) => {
              const raw: unknown = JSON.parse(out.testsJson)
              let tests: readonly TestResult[]
              if (Array.isArray(raw)) tests = raw.filter(isTestResultLike)
              else tests = []
              if (out.status === 'Error') {
                return { status: 'error' as const, errorMessage: out.errorMessage ?? 'unknown' } satisfies DryRunResult
              }
              return { status: 'complete' as const, tests } satisfies DryRunResult
            },
          })
        ),
        Cell.write<DryRunPhases>((output) =>
          Effect.gen(function*() {
            if (output.status === 'complete') {
              const mutantCoverage = yield* readMutantCoverage.pipe(
                Effect.mapError((cause) =>
                  new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) })
                ),
              )
              if (mutantCoverage !== undefined) return { ...output, mutantCoverage } satisfies DryRunResult
            }
            return output
          })
        ),
      )
      const mutantRunDescription: Cell.WriteDone<MutantRunPhases> = pipe(
        Cell.read<MutantRunPhases>((command) =>
          Effect.gen(function*() {
            const ctx = yield* requireCtx
            ctx.provide('mode', 'mutant')
            ctx.provide('hitLimit', command.hitLimit)
            ctx.provide('mutantActivation', command.mutantActivation)
            ctx.provide('activeMutant', command.activeMutant.id)
            const { rawTests, hasExternalError, externalErrorText } = yield* collectRaw({
              testIds: (() => {
                if (command.testFilter !== undefined) return [...command.testFilter]
                return undefined
              })(),
              relatedFiles: [command.sandboxFileName],
            })
            const hitCount = yield* readHitCount.pipe(
              Effect.mapError((cause) =>
                new TestRunnerFailed({ runnerName: 'vitest', phase: 'mutantRun', cause: errorToString(cause) })
              ),
              Effect.option,
              Effect.map(Option.getOrUndefined),
            )
            const reportAllKillers = (() => {
              if (typeof input.options.disableBail === 'boolean') return input.options.disableBail
              return false
            })()
            if (hitCount === undefined) {
              return {
                rawTests,
                projectRoot: input.sandboxDirectory,
                hasExternalError,
                externalErrorText,
                hitLimit: command.hitLimit,
                reportAllKillers,
              }
            }
            return {
              rawTests,
              projectRoot: input.sandboxDirectory,
              hasExternalError,
              externalErrorText,
              hitCount,
              hitLimit: command.hitLimit,
              reportAllKillers,
            }
          })
        ),
        Cell.decode<MutantRunPhases>((raw) => {
          const base = {
            rawTests: raw.rawTests,
            projectRoot: raw.projectRoot,
            hasExternalError: raw.hasExternalError,
            externalErrorText: raw.externalErrorText,
            reportAllKillers: raw.reportAllKillers,
          }
          if (raw.hitCount !== undefined) {
            if (raw.hitLimit !== undefined) {
              return Result.succeed(
                new VitestMutantRunCommand({ ...base, hitCount: raw.hitCount, hitLimit: raw.hitLimit }),
              )
            }
            return Result.succeed(new VitestMutantRunCommand({ ...base, hitCount: raw.hitCount }))
          }
          if (raw.hitLimit !== undefined) {
            return Result.succeed(new VitestMutantRunCommand({ ...base, hitLimit: raw.hitLimit }))
          }
          return Result.succeed(new VitestMutantRunCommand(base))
        }),
        Cell.decide<MutantRunPhases>(vitestMutantRunWorkflow),
        Cell.encode<MutantRunPhases>((outcome) =>
          Result.match(outcome, {
            onFailure: (e) => ({ status: 'error' as const, errorMessage: e.message }) satisfies MutantRunResult,
            onSuccess: (out) => {
              let parsed: readonly { id: string }[]
              try {
                const raw: unknown = JSON.parse(out.testsJson)
                if (Array.isArray(raw)) parsed = raw.filter(isIdRecord)
                else parsed = []
              } catch {
                parsed = []
              }
              const nrOfTests: number = parsed.length
              if (out.status === 'Error') {
                return {
                  status: 'error' as const,
                  errorMessage: out.errorMessage ?? 'unknown',
                } satisfies MutantRunResult
              }
              if (out.status === 'Timeout') {
                if (out.reason === undefined) {
                  return { status: 'timeout' as const } satisfies MutantRunResult
                }
                return { status: 'timeout' as const, reason: out.reason } satisfies MutantRunResult
              }
              if (out.status === 'Killed') {
                return {
                  status: 'killed' as const,
                  failureMessage: out.failureMessage ?? '',
                  killedBy: (() => {
                    if (out.killerIds !== undefined) return [...out.killerIds]
                    return []
                  })(),
                  nrOfTests,
                } satisfies MutantRunResult
              }
              return { status: 'survived' as const, nrOfTests } satisfies MutantRunResult
            },
          })
        ),
        Cell.write<MutantRunPhases>((output) => Effect.succeed(output)),
      )
      const dryRun: TestRunner['Service']['dryRun'] = (options) =>
        Cell.apply(dryRunDescription, options).pipe(Effect.mapError((cause) => ((() => {
          if (cause instanceof TestRunnerFailed) return cause
          return new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) })
        })())))
      const mutantRun: TestRunner['Service']['mutantRun'] = (options) =>
        Cell.apply(mutantRunDescription, options).pipe(Effect.mapError((cause) => ((() => {
          if (cause instanceof TestRunnerFailed) return cause
          return new TestRunnerFailed({ runnerName: 'vitest', phase: 'mutantRun', cause: errorToString(cause) })
        })())))
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
            catch: (cause) =>
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'dispose', cause: errorToString(cause) }),
          })
        }
      })
      return TestRunner.of({ capabilities, init, dryRun, mutantRun, dispose })
    }),
  )

function isTestResultLike(value: unknown): value is TestResult {
  return typeof value === 'object' && value !== null && 'id' in value && typeof Reflect.get(value, 'id') === 'string'
}

function isIdRecord(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && 'id' in value && typeof Reflect.get(value, 'id') === 'string'
}

function mergeCoverage(to: CoverageData, from: CoverageData): void {
  for (const [mutantId, hitCount] of Object.entries(from)) {
    if (mutantId in to) to[mutantId] = to[mutantId] + hitCount
    else to[mutantId] = hitCount
  }
}
