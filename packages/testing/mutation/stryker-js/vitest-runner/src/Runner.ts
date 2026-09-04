import type * as PathType from 'effect/Path'
import type { RunMode, RunnerTestCase, RunnerTestSuite, TaskState as VitestTaskState } from 'vitest'
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
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { interpretVitestRun, VitestMutantRunCommand } from './interpret-vitest-run.workflow.js'
import type { VitestMutantRunError, VitestMutantRunOutput } from './interpret-vitest-run.workflow.js'
import {
  CoverageDecodeFailed,
  DryRunComplete,
  DryRunExternalError,
  ExportEntry,
  HitCountMetaSchema,
  MutantCoverageMetaSchema,
  MutantCoverageShapeSchema,
  PackageManifest,
  VitestDryRunCommand,
  type VitestDryRunOutcome,
  VitestNodeModuleSchema,
  VitestPackageSchema,
  VitestSectionSchema,
} from './Runner.schema.js'

export class VitestHarness extends Context.Service<VitestHarness, {
  readonly setMode: (mode: 'dry-run' | 'mutant') => Effect.Effect<void, TestRunnerFailed>
  readonly provide: (
    key: 'hitLimit' | 'mutantActivation' | 'activeMutant',
    value: unknown,
  ) => Effect.Effect<void, TestRunnerFailed>
}>()('VitestHarness') {}

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

function convertTaskStateToTestStatus(taskState: VitestTaskState | undefined, testMode: RunMode): TestStatus {
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

export const VITEST_ERROR_CODES = Object.freeze({ FILES_NOT_FOUND: 'VITEST_FILES_NOT_FOUND' })

type TaskState = 'pass' | 'fail' | 'skip' | 'todo' | 'run' | 'queued' | 'only' | undefined

const recordOption = (value: unknown): Option.Option<Record<string, unknown>> =>
  S.decodeUnknownOption(S.Record(S.String, S.Unknown))(value)

const getStringField = (record: Record<string, unknown>, key: string): Option.Option<string> =>
  Option.fromNullishOr(record[key]).pipe(Option.filter((v): v is string => typeof v === 'string'))

const getNumberField = (record: Record<string, unknown>, key: string): Option.Option<number> =>
  Option.fromNullishOr(record[key]).pipe(Option.filter((v): v is number => typeof v === 'number'))

const getSuite = (value: unknown): Option.Option<unknown> =>
  recordOption(value).pipe(Option.flatMap((rec) => Option.fromNullishOr(rec['suite'])))

const getFile = (value: unknown): Option.Option<unknown> =>
  recordOption(value).pipe(Option.flatMap((rec) => Option.fromNullishOr(rec['file'])))

const getResult = (value: unknown): Option.Option<unknown> =>
  recordOption(value).pipe(Option.flatMap((rec) => Option.fromNullishOr(rec['result'])))

const getErrors = (value: unknown): Option.Option<readonly unknown[]> =>
  recordOption(value).pipe(
    Option.flatMap((rec) => Option.fromNullishOr(rec['errors'])),
    Option.filter((v): v is readonly unknown[] => Array.isArray(v)),
  )

const getMessage = (value: unknown): Option.Option<string> =>
  recordOption(value).pipe(
    Option.flatMap((rec) => Option.fromNullishOr(rec['message'])),
    Option.filter((v): v is string => typeof v === 'string'),
  )

const getName = (value: unknown): string =>
  Option.match(recordOption(value), {
    onNone: () => '',
    onSome: (rec) => Option.getOrElse(getStringField(rec, 'name'), () => ''),
  })

const getMode = (value: unknown): string =>
  Option.match(recordOption(value), {
    onNone: () => 'run',
    onSome: (rec) => Option.getOrElse(getStringField(rec, 'mode'), () => 'run'),
  })

const getState = (value: unknown): TaskState =>
  Match.value(value).pipe(
    Match.when('pass', (): TaskState => 'pass'),
    Match.when('fail', (): TaskState => 'fail'),
    Match.when('skip', (): TaskState => 'skip'),
    Match.when('todo', (): TaskState => 'todo'),
    Match.when('run', (): TaskState => 'run'),
    Match.when('queued', (): TaskState => 'queued'),
    Match.when('only', (): TaskState => 'only'),
    Match.when(undefined, (): TaskState => undefined),
    Match.orElse((): TaskState => undefined),
  )

const getDuration = (value: unknown): number =>
  Option.match(recordOption(value), {
    onNone: () => 0,
    onSome: (rec) => Option.getOrElse(getNumberField(rec, 'duration'), () => 0),
  })

const getFilepath = (value: unknown): string | undefined =>
  Option.match(recordOption(value), {
    onNone: (): string | undefined => undefined,
    onSome: (rec) =>
      Option.getOrUndefined(
        Option.fromNullishOr(rec['filepath']).pipe(Option.filter((v): v is string => typeof v === 'string')),
      ),
  })

const collectSuiteNames = (suite: unknown): readonly string[] =>
  Option.match(Option.fromNullishOr(suite), {
    onNone: (): readonly string[] => [],
    onSome: (current): readonly string[] =>
      Option.match(recordOption(current), {
        onNone: (): readonly string[] => [],
        onSome: (rec): readonly string[] => {
          const name = Option.getOrElse(getStringField(rec, 'name'), () => '')
          const hasName = name.length > 0
          const parentNames = collectSuiteNames(rec['suite'])
          return Match.value(hasName).pipe(
            Match.when(true, (): readonly string[] => [...parentNames, name]),
            Match.when(false, (): readonly string[] => parentNames),
            Match.exhaustive,
          )
        },
      }),
  })

const collectTestNameRaw = (test: unknown): string => {
  const name = getName(test)
  const suite = Option.getOrUndefined(getSuite(test))
  const suiteNames = collectSuiteNames(suite)
  const parts = [...suiteNames, name]
  return parts.join(' ').trim()
}

const toRawTestIdRaw = (test: unknown): string => {
  const filepath = Option.match(getFile(test), {
    onNone: (): string => 'unknown.js',
    onSome: (file): string => Option.getOrElse(Option.fromNullishOr(getFilepath(file)), (): string => 'unknown.js'),
  })
  return `${filepath}#${collectTestNameRaw(test)}`
}

const normalizeTestIdRaw = (id: string, projectRoot: string): string => {
  const hash = id.indexOf('#')
  if (hash === -1) {
    return id
  }
  const file = id.slice(0, hash)
  const rest = id.slice(hash + 1)
  const stripped = (() => {
    if (file.startsWith(projectRoot)) {
      return file.slice(projectRoot.length)
    }
    return file
  })()
  const relative = stripped.replace(/^[/\\]+/, '').replaceAll('\\', '/')
  return `${relative}#${rest}`
}

const toTestStatus = (taskState: TaskState, mode: string): TestStatus =>
  Match.value(mode === 'skip').pipe(
    Match.when(true, (): TestStatus => 'skipped'),
    Match.when(false, (): TestStatus =>
      Match.value(taskState).pipe(
        Match.when('pass', (): TestStatus => 'success'),
        Match.when('fail', (): TestStatus => 'failed'),
        Match.when('skip', (): TestStatus => 'skipped'),
        Match.when('todo', (): TestStatus => 'skipped'),
        Match.when(undefined, (): TestStatus => 'failed'),
        Match.when('queued', (): TestStatus => 'failed'),
        Match.when('run', (): TestStatus => 'failed'),
        Match.when('only', (): TestStatus => 'failed'),
        Match.orElse((): TestStatus => 'failed'),
      )),
    Match.exhaustive,
  )

const findSuiteErrorRaw = (suite: unknown): string | undefined =>
  Option.match(Option.fromNullishOr(suite), {
    onNone: (): string | undefined => undefined,
    onSome: (current): string | undefined =>
      Option.match(recordOption(current), {
        onNone: (): string | undefined => undefined,
        onSome: (rec): string | undefined => {
          const maybeError = Option.flatMap(getResult(rec), (result) =>
            Option.flatMap(getErrors(result), (errs) =>
              Match.value(errs.length > 0).pipe(
                Match.when(true, () => Option.flatMap(Option.fromNullishOr(errs[0]), (first) => getMessage(first))),
                Match.when(false, () => Option.none()),
                Match.exhaustive,
              )))
          return Option.match(maybeError, {
            onNone: (): string | undefined =>
              findSuiteErrorRaw(rec['suite']),
            onSome: (msg): string | undefined => msg,
          })
        },
      }),
  })

const extractStatus = (test: unknown): TestStatus => {
  const result = Option.getOrUndefined(getResult(test))
  const mode = getMode(test)
  const state = Option.match(Option.fromNullishOr(result), {
    onNone: (): TaskState => undefined,
    onSome: (r): TaskState =>
      Option.match(recordOption(r), {
        onNone: (): TaskState => undefined,
        onSome: (rec): TaskState => getState(rec['state']),
      }),
  })
  return toTestStatus(state, mode)
}

const extractDuration = (test: unknown): number =>
  Option.match(getResult(test), {
    onNone: (): number => 0,
    onSome: (result): number =>
      Option.match(recordOption(result), {
        onNone: (): number => 0,
        onSome: (rec): number => getDuration(rec),
      }),
  })

const extractFileName = (test: unknown): string | undefined =>
  Option.match(getFile(test), {
    onNone: (): string | undefined => undefined,
    onSome: (file): string | undefined => getFilepath(file),
  })

const extractRawId = (test: unknown, projectRoot: string): string =>
  normalizeTestIdRaw(toRawTestIdRaw(test), projectRoot)

const extractName = (test: unknown): string => collectTestNameRaw(test)

const extractFailureMessage = (test: unknown): string =>
  Option.match(getResult(test), {
    onNone: (): string => 'StrykerJS: Unknown test failure',
    onSome: (result): string =>
      Option.match(getErrors(result), {
        onNone: (): string => 'StrykerJS: Unknown test failure',
        onSome: (errs): string =>
          Match.value(errs.length > 0).pipe(
            Match.when(true, (): string =>
              Option.match(Option.fromNullishOr(errs[0]), {
                onNone: (): string => 'StrykerJS: Unknown test failure',
                onSome: (first): string =>
                  Option.getOrElse(getMessage(first), (): string => 'StrykerJS: Unknown test failure'),
              })),
            Match.when(false, (): string => 'StrykerJS: Unknown test failure'),
            Match.exhaustive,
          ),
      }),
  })

const convertTestRaw = (
  test: unknown,
  projectRoot: string,
): {
  readonly id: string
  readonly name: string
  readonly timeSpentMs: number
  readonly fileName: string | undefined
  readonly status: TestStatus
  readonly failureMessage?: string
} => {
  const status = extractStatus(test)
  const base = {
    id: extractRawId(test, projectRoot),
    name: extractName(test),
    timeSpentMs: extractDuration(test),
    fileName: extractFileName(test),
    status,
  }
  return Match.value(status).pipe(
    Match.when('failed', (): {
      readonly id: string
      readonly name: string
      readonly timeSpentMs: number
      readonly fileName: string | undefined
      readonly status: TestStatus
      readonly failureMessage?: string
    } => ({ ...base, status, failureMessage: extractFailureMessage(test) })),
    Match.when('skipped', (): {
      readonly id: string
      readonly name: string
      readonly timeSpentMs: number
      readonly fileName: string | undefined
      readonly status: TestStatus
      readonly failureMessage?: string
    } =>
      Match.value(findSuiteErrorRaw(Option.getOrUndefined(getSuite(test)))).pipe(
        Match.when(Match.defined, (suiteError): {
          readonly id: string
          readonly name: string
          readonly timeSpentMs: number
          readonly fileName: string | undefined
          readonly status: TestStatus
          readonly failureMessage?: string
        } => ({
          ...base,
          status: 'failed',
          failureMessage: suiteError,
        })),
        Match.orElse((): {
          readonly id: string
          readonly name: string
          readonly timeSpentMs: number
          readonly fileName: string | undefined
          readonly status: TestStatus
          readonly failureMessage?: string
        } => ({ ...base, status })),
      )),
    Match.orElse((): {
      readonly id: string
      readonly name: string
      readonly timeSpentMs: number
      readonly fileName: string | undefined
      readonly status: TestStatus
      readonly failureMessage?: string
    } => ({ ...base, status })),
  )
}

export const decideVitestDryRun = (command: VitestDryRunCommand): VitestDryRunOutcome => {
  const tests = command.rawTests.map((t) => convertTestRaw(t, command.projectRoot))
  const hasFailure = tests.some((t) => t.status === 'failed')
  if (hasFailure === false && command.hasExternalError) {
    return DryRunExternalError.make({
      testsJson: JSON.stringify(tests),
      errorMessage: `An error occurred outside of a test run: ${command.externalErrorText}`,
    })
  }
  return DryRunComplete.make({ testsJson: JSON.stringify(tests) })
}

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
      const harnessImpl: VitestHarness['Service'] = {
        setMode: (mode) =>
          Effect.gen(function*() {
            const ctx = yield* requireCtx
            ctx.provide('mode', mode)
          }),
        provide: (key, value) =>
          Effect.gen(function*() {
            const ctx = yield* requireCtx
            if (key === 'hitLimit') {
              if (typeof value === 'number' || value === undefined) ctx.provide('hitLimit', value)
              else ctx.provide('hitLimit', undefined)
            } else if (key === 'mutantActivation') {
              if (value === 'runtime' || value === 'static') ctx.provide('mutantActivation', value)
            } else if (typeof value === 'string') ctx.provide('activeMutant', value)
          }),
      }

      const mutantRunCell = Cell.layer({
        read: (command: MutantRunOptions) =>
          Effect.gen(function*() {
            const harness = yield* VitestHarness
            yield* harness.setMode('mutant')
            yield* harness.provide('hitLimit', command.hitLimit)
            yield* harness.provide('mutantActivation', command.mutantActivation)
            yield* harness.provide('activeMutant', command.activeMutant.id)
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
          }),
        decode: (
          raw: {
            readonly rawTests: readonly unknown[]
            readonly projectRoot: string
            readonly hasExternalError: boolean
            readonly externalErrorText: string
            readonly hitCount?: number | undefined
            readonly hitLimit: number | undefined
            readonly reportAllKillers: boolean
          },
        ) => {
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
        },
        decide: interpretVitestRun,
        encode: (outcome: Result.Result<VitestMutantRunOutput, VitestMutantRunError>) =>
          Result.match(outcome, {
            onFailure: (e) => ({ status: 'error' as const, errorMessage: e.message }) satisfies MutantRunResult,
            onSuccess: (out) => {
              const nrOfTests = (): number => {
                try {
                  const raw: unknown = JSON.parse(out.testsJson)
                  if (Array.isArray(raw)) return raw.filter(isIdRecord).length
                  return 0
                } catch {
                  return 0
                }
              }
              return Match.value(out).pipe(
                Match.tag(
                  'Error',
                  (error) =>
                    ({
                      status: 'error' as const,
                      errorMessage: error.errorMessage ?? 'unknown',
                    }) satisfies MutantRunResult,
                ),
                Match.tag('Timeout', (timeout) =>
                  (() => {
                    if (timeout.reason === undefined) {
                      return { status: 'timeout' as const } satisfies MutantRunResult
                    }
                    return { status: 'timeout' as const, reason: timeout.reason } satisfies MutantRunResult
                  })()),
                Match.tag(
                  'Killed',
                  (killed) =>
                    ({
                      status: 'killed' as const,
                      failureMessage: killed.failureMessage ?? '',
                      killedBy: (() => {
                        if (killed.killerIds !== undefined) return [...killed.killerIds]
                        return []
                      })(),
                      nrOfTests: nrOfTests(),
                    }) satisfies MutantRunResult,
                ),
                Match.tag(
                  'Survived',
                  () => ({ status: 'survived' as const, nrOfTests: nrOfTests() }) satisfies MutantRunResult,
                ),
                Match.exhaustive,
              )
            },
          }),
        write: (output: MutantRunResult, _raw: unknown) => Effect.succeed(output),
      })
      const dryRun: TestRunner['Service']['dryRun'] = (options) =>
        Effect.gen(function*() {
          const harness = yield* VitestHarness
          yield* harness.setMode('dry-run')
          const hasTestFiles = testFilesProvided(options)
          const filter: RunFilter = (() => {
            if (hasTestFiles) {
              return {
                testFiles: [...(options.testFiles ?? [])],
                relatedFiles: (() => {
                  if (options.files !== undefined) return [...options.files]
                  return undefined
                })(),
              }
            }
            return {
              relatedFiles: (() => {
                if (options.files !== undefined) return [...options.files]
                return undefined
              })(),
            }
          })()
          const { rawTests, hasExternalError, externalErrorText } = yield* collectRaw(filter satisfies RunFilter)
          const decision: VitestDryRunOutcome = decideVitestDryRun(
            new VitestDryRunCommand({
              rawTests,
              projectRoot: input.sandboxDirectory,
              hasExternalError,
              externalErrorText,
            }),
          )
          const result: DryRunResult = Match.value(decision).pipe(
            Match.tag(
              'Error',
              (error) => ({ status: 'error' as const, errorMessage: error.errorMessage }) satisfies DryRunResult,
            ),
            Match.tag('Complete', (complete) => {
              const raw: unknown = JSON.parse(complete.testsJson)
              let tests: readonly TestResult[]
              if (Array.isArray(raw)) tests = raw.filter(isTestResultLike)
              else tests = []
              return { status: 'complete' as const, tests } satisfies DryRunResult
            }),
            Match.exhaustive,
          )
          if (result.status === 'complete') {
            const mutantCoverage = yield* readMutantCoverage.pipe(
              Effect.mapError((cause) =>
                new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) })
              ),
            )
            if (mutantCoverage !== undefined) return { ...result, mutantCoverage } satisfies DryRunResult
          }
          return result
        }).pipe(
          Effect.provideService(VitestHarness, harnessImpl),
          Effect.mapError((cause) => ((() => {
            if (cause instanceof TestRunnerFailed) return cause
            return new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) })
          })())),
        )
      const mutantRun: TestRunner['Service']['mutantRun'] = (options) =>
        Cell.run(mutantRunCell, options).pipe(
          Effect.provideService(VitestHarness, harnessImpl),
          Effect.mapError((cause) => ((() => {
            if (cause instanceof TestRunnerFailed) return cause
            return new TestRunnerFailed({ runnerName: 'vitest', phase: 'mutantRun', cause: errorToString(cause) })
          })())),
        )
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
