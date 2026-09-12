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
import * as Predicate from 'effect/Predicate'
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
  return Match.value(testMode).pipe(
    Match.when('skip', (): TestStatus => 'skipped'),
    Match.orElse((): TestStatus =>
      Match.value(taskState).pipe(
        Match.when('pass', (): TestStatus => 'success'),
        Match.when('fail', (): TestStatus => 'failed'),
        Match.when('skip', (): TestStatus => 'skipped'),
        Match.when('todo', (): TestStatus => 'skipped'),
        Match.orElse((): TestStatus => 'failed'),
      )
    ),
  )
}

const UNKNOWN_TEST_FAILURE = 'StrykerJS: Unknown test failure'
const SUITE_EXECUTION_FAILED = 'StrykerJS: Suite execution failed'

const firstErrorMessage = (errors: readonly { readonly message?: string }[] | undefined): Option.Option<string> =>
  Option.flatMap(
    Option.fromNullishOr(errors),
    (list) => Option.flatMap(Option.fromNullishOr(list[0]), (error) => Option.fromNullishOr(error.message)),
  )

const taskStateOf = (test: RunnerTestCase): VitestTaskState | undefined =>
  Option.getOrUndefined(
    Option.fromNullishOr(test.result).pipe(Option.flatMap((result) => Option.fromNullishOr(result.state))),
  )

const timeSpentMsOf = (test: RunnerTestCase): number =>
  Option.getOrElse(
    Option.fromNullishOr(test.result).pipe(Option.flatMap((result) => Option.fromNullishOr(result.duration))),
    (): number => 0,
  )

const failureMessageOf = (test: RunnerTestCase): string =>
  Option.getOrElse(
    Option.fromNullishOr(test.result).pipe(Option.flatMap((result) => firstErrorMessage(result.errors))),
    (): string => UNKNOWN_TEST_FAILURE,
  )

const suiteFailureMessageOf = (suite: RunnerTestSuite): string =>
  Option.getOrElse(
    Option.fromNullishOr(suite.result).pipe(Option.flatMap((result) => firstErrorMessage(result.errors))),
    (): string => SUITE_EXECUTION_FAILED,
  )

const isFailedSuite = (suite: RunnerTestSuite): boolean =>
  Option.exists(Option.fromNullishOr(suite.result), (result) => result.state === 'fail')

const findSuiteError = (suite: RunnerTestSuite | undefined): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(suite), (node) =>
    Match.value(isFailedSuite(node)).pipe(
      Match.when(true, (): Option.Option<string> => Option.some(suiteFailureMessageOf(node))),
      Match.when(false, (): Option.Option<string> => findSuiteError(node.suite)),
      Match.exhaustive,
    ))

const skippedTestResult = (baseTestResult: BaseTestResult, test: RunnerTestCase): TestResult =>
  Option.match(findSuiteError(test.suite).pipe(Option.filter((message) => message.length > 0)), {
    onNone: (): TestResult => ({ ...baseTestResult, status: 'skipped' }),
    onSome: (failureMessage): TestResult => ({ ...baseTestResult, status: 'failed', failureMessage }),
  })

export function convertTestToTestResult(test: RunnerTestCase, projectRoot: string, pathService: Path.Path): TestResult {
  const baseTestResult: BaseTestResult = {
    id: normalizeTestId(toRawTestId(test), projectRoot, pathService),
    name: collectTestName(test),
    timeSpentMs: timeSpentMsOf(test),
    fileName: pathService.resolve(test.file.filepath),
  }
  return Match.value(convertTaskStateToTestStatus(taskStateOf(test), test.mode)).pipe(
    Match.when('failed', (): TestResult => ({
      ...baseTestResult,
      status: 'failed',
      failureMessage: failureMessageOf(test),
    })),
    Match.when('skipped', (): TestResult => skippedTestResult(baseTestResult, test)),
    Match.orElse((): TestResult => ({ ...baseTestResult, status: 'success' })),
  )
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
  return error instanceof Error && typeof Reflect.get(error, 'code') === 'string'
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
        Match.when('skip', (): TestStatus => 'skipped'),
        Match.when('todo', (): TestStatus => 'skipped'),
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
  const testsJson = JSON.stringify(tests)
  const hasFailure = tests.some((t) => t.status === 'failed')
  return Match.value(hasFailure).pipe(
    Match.when(true, (): VitestDryRunOutcome => DryRunComplete.make({ testsJson })),
    Match.orElse((): VitestDryRunOutcome =>
      Match.value(command.hasExternalError).pipe(
        Match.when(
          true,
          (): VitestDryRunOutcome =>
            DryRunExternalError.make({
              testsJson,
              errorMessage: `An error occurred outside of a test run: ${command.externalErrorText}`,
            }),
        ),
        Match.orElse((): VitestDryRunOutcome => DryRunComplete.make({ testsJson })),
      )
    ),
  )
}

const TYPESCRIPT_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts'] as const

const isTypescriptSourcePath = (filePath: string): boolean =>
  TYPESCRIPT_SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension))

const typescriptSourcePath = (filePath: string): string | undefined =>
  Option.getOrUndefined(Option.filter(Option.some(filePath), isTypescriptSourcePath))

const sourceTargetOf = (entry: ExportEntry): string | undefined =>
  Match.value(entry).pipe(
    Match.when(Match.string, (filePath) => typescriptSourcePath(filePath)),
    Match.orElse((): string | undefined => undefined),
  )

const subpathSpecifier = (packageName: string, exportKey: string): string | undefined =>
  Match.value(exportKey.startsWith('./')).pipe(
    Match.when(true, () => `${packageName}/${exportKey.slice(2)}`),
    Match.orElse((): string | undefined => undefined),
  )

const specifierForExport = (packageName: string, exportKey: string): string | undefined =>
  Match.value(exportKey).pipe(
    Match.when('.', () => packageName),
    Match.when('./package.json', () => undefined),
    Match.orElse((key) => subpathSpecifier(packageName, key)),
  )

const namedExports = (
  manifest: PackageManifest,
): Option.Option<{ readonly name: string; readonly exports: Record<string, ExportEntry> }> =>
  Option.flatMap(
    Option.filter(Option.fromNullishOr(manifest.name), (name) => name.length > 0),
    (name) => Option.map(Option.fromNullishOr(manifest.exports), (exportMap) => ({ name, exports: exportMap })),
  )

const exportAlias = (
  packageName: string,
  projectRoot: string,
  pathService: PathType.Path,
  [exportKey, entry]: readonly [string, ExportEntry],
): Option.Option<SandboxAlias> =>
  Option.flatMap(
    Option.fromNullishOr(specifierForExport(packageName, exportKey)),
    (spec) =>
      Option.map(Option.fromNullishOr(sourceTargetOf(entry)), (target) => ({
        find: new RegExp(`^${RegExp.escape(spec)}$`),
        replacement: pathService.resolve(projectRoot, target),
      })),
  )

export const sandboxSelfAliases = (
  manifest: PackageManifest,
  projectRoot: string,
  pathService: PathType.Path,
): readonly SandboxAlias[] =>
  Option.match(namedExports(manifest), {
    onNone: (): readonly SandboxAlias[] => [],
    onSome: ({ name, exports: exportMap }) =>
      Object.entries(exportMap).flatMap((entry) => Option.toArray(exportAlias(name, projectRoot, pathService, entry))),
  })

export interface SandboxAlias {
  readonly find: RegExp
  readonly replacement: string
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
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
    return Option.match(
      Option.flatMap(
        Option.fromNullishOr(raw),
        (content) => S.decodeUnknownOption(PackageManifest)(parseJson(content)),
      ),
      {
        onNone: () => [] satisfies readonly SandboxAlias[],
        onSome: (manifest) => sandboxSelfAliases(manifest, projectRoot, pathService),
      },
    )
  })

export const sandboxSelfPlugin = (
  aliases: readonly SandboxAlias[],
): { readonly name: string; readonly enforce: 'pre'; readonly resolveId: (source: string) => string | undefined } => ({
  name: 'stryker-sandbox-self-exports',
  enforce: 'pre',
  resolveId(source: string): string | undefined {
    return Option.getOrUndefined(
      Option.map(
        Option.fromNullishOr(aliases.find((alias) => alias.find.test(source))),
        (alias) => alias.replacement,
      ),
    )
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
  Predicate.isObject(value) && Array.isArray(value['tasks'])

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

const versionPart = (parts: readonly string[], index: number): number =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(parts[index]), (part) => Number(part)),
    (): number => 0,
  )

const minimumMinorForMajor = (major: number): Option.Option<number> =>
  Match.value(major).pipe(
    Match.when((value) => value > 4, () => Option.some(0)),
    Match.when(4, () => Option.some(1)),
    Match.orElse((): Option.Option<number> => Option.none()),
  )

export const shouldUseSuiteMetaSecondArg = (version: string): boolean => {
  const parts = version.split('.')
  const major = versionPart(parts, 0)
  const minor = versionPart(parts, 1)
  return Match.value(Number.isNaN(major) || Number.isNaN(minor)).pipe(
    Match.when(true, (): boolean => false),
    Match.orElse((): boolean => Option.exists(minimumMinorForMajor(major), (minimumMinor) => minor >= minimumMinor)),
  )
}

interface RunFilter {
  testIds?: string[]
  relatedFiles?: string[]
  testFiles?: string[]
}

type RunFilterPlan = {
  readonly testNamePattern: RegExp | undefined
  readonly testFiles: string[] | undefined
}

const relatedFilesOf = (relatedValue: unknown, relatedFiles: readonly string[] | undefined): string[] | undefined =>
  Match.value(relatedValue !== false).pipe(
    Match.when(
      true,
      () =>
        Option.getOrUndefined(Option.map(Option.fromNullishOr(relatedFiles), (files) => files.map(normalizeFileName))),
    ),
    Match.orElse((): string[] | undefined => undefined),
  )

const testIdPlan = (
  testIds: readonly string[] | undefined,
  projectRoot: string,
  pathService: Path.Path,
): Option.Option<RunFilterPlan> =>
  Option.map(Option.filter(Option.fromNullishOr(testIds), (ids) => ids.length > 0), (ids) => ({
    testNamePattern: new RegExp(ids.map((id) => RegExp.escape(fromTestId(id).test)).join('|')),
    testFiles: ids.map((id) => pathService.resolve(projectRoot, fromTestId(id).file)),
  }))

const runFilterPlan = (filter: RunFilter, projectRoot: string, pathService: Path.Path): RunFilterPlan => {
  const plan = testIdPlan(filter.testIds, projectRoot, pathService)
  return {
    testNamePattern: Option.getOrUndefined(Option.map(plan, (value) => value.testNamePattern)),
    testFiles: Option.match(plan, {
      onNone: (): string[] | undefined =>
        Option.getOrUndefined(Option.map(Option.fromNullishOr(filter.testFiles), (files) => [...files])),
      onSome: (value): string[] | undefined => value.testFiles,
    }),
  }
}

const isMissingTestFilesCause = (cause: unknown): boolean =>
  Match.value(isErrorCodeError(cause)).pipe(
    Match.when(true, () => typeof cause === 'string' && cause.includes(VITEST_ERROR_CODES.FILES_NOT_FOUND)),
    Match.orElse((): boolean => false),
  )
interface RunnerState {
  ctx: Vitest | undefined
  localSetupFile: string | undefined
}

const experimentalStateGetFiles = (vitest: Vitest): readonly unknown[] =>
  vitest.state.getFiles() satisfies readonly unknown[]

const propertyOf = (value: unknown, key: string): Option.Option<unknown> =>
  Option.flatMap(
    Option.filter(Option.fromNullishOr(value), Predicate.isObject),
    (record) => Option.fromNullishOr(record[key]),
  )

const vitestStateOf = (vitest: unknown): Option.Option<unknown> => propertyOf(vitest, 'state')

const errorsSetOf = (vitest: unknown): Option.Option<unknown> =>
  Option.flatMap(vitestStateOf(vitest), (state) => propertyOf(state, 'errorsSet'))

const invokeMethod = (holder: unknown, name: string): void =>
  Option.match(Option.filter(propertyOf(holder, name), Predicate.isFunction), {
    onNone: (): void => undefined,
    onSome: (method): void => {
      Reflect.apply(method, holder, [])
    },
  })

const clearFilesMap = (filesMap: unknown): void =>
  Match.value(filesMap).pipe(
    Match.when(Match.instanceOf(Map), (map) => {
      map.clear()
    }),
    Match.orElse((value): void => invokeMethod(value, 'clear')),
  )

const experimentalStateClearFiles = (vitest: unknown): void =>
  Option.match(Option.flatMap(vitestStateOf(vitest), (state) => propertyOf(state, 'filesMap')), {
    onNone: (): void => undefined,
    onSome: (filesMap): void => clearFilesMap(filesMap),
  })

const entryCountOf = (collection: unknown): Option.Option<number> =>
  Match.value(collection).pipe(
    Match.when(Match.instanceOf(Set), (set) => Option.some(set.size)),
    Match.orElse((value) => Option.filter(propertyOf(value, 'size'), Predicate.isNumber)),
  )

const experimentalStateHasExternalErrors = (vitest: unknown): boolean =>
  Option.exists(Option.flatMap(errorsSetOf(vitest), entryCountOf), (count) => count > 0)

const experimentalStateGetExternalErrorText = (vitest: unknown): string =>
  Option.match(errorsSetOf(vitest), {
    onNone: (): string => '',
    onSome: (errorsSet): string =>
      Match.value(errorsSet).pipe(
        Match.when(Predicate.isIterable, (errors) => [...errors].map(errorToString).join('\n')),
        Match.orElse((): string => ''),
      ),
  })

const applyHarnessValue = (ctx: Vitest, key: 'hitLimit' | 'mutantActivation' | 'activeMutant', value: unknown): void =>
  Match.value(key).pipe(
    Match.when('hitLimit', () => {
      ctx.provide('hitLimit', Option.getOrUndefined(Option.filter(Option.fromNullishOr(value), Predicate.isNumber)))
    }),
    Match.when('mutantActivation', () => {
      Match.value(value).pipe(
        Match.when(Match.is('runtime', 'static'), (activation) => {
          ctx.provide('mutantActivation', activation)
        }),
        Match.orElse((): void => undefined),
      )
    }),
    Match.orElse(() => {
      Match.value(value).pipe(
        Match.when(Predicate.isString, (activeMutant) => {
          ctx.provide('activeMutant', activeMutant)
        }),
        Match.orElse((): void => undefined),
      )
    }),
  )

const applyRunFilterToConfig = (
  vitest: Vitest,
  options: { related: string[] | undefined; testNamePattern: RegExp | undefined },
): void => {
  Reflect.set(vitest.config, 'related', options.related)
  for (const project of vitest.projects) Reflect.set(project.config, 'testNamePattern', options.testNamePattern)
}

const disableScreenshotFailures = (value: unknown): void =>
  Option.match(Option.filter(Option.fromNullishOr(value), Predicate.isObject), {
    onNone: (): void => undefined,
    onSome: (browser): void => {
      Reflect.set(browser, 'screenshotFailures', false)
    },
  })

const setupFilePathsOf = (value: unknown): readonly string[] =>
  Match.value(value).pipe(
    Match.when(Array.isArray, (setupFiles) => setupFiles.filter(Predicate.isString)),
    Match.orElse((): readonly string[] => []),
  )

const applySetupFilesToProjects = (vitest: Vitest, localSetupFile: string): void => {
  disableScreenshotFailures(Reflect.get(vitest.config, 'browser'))
  for (const project of vitest.projects) {
    const setupFiles = setupFilePathsOf(Reflect.get(project.config, 'setupFiles'))
    Reflect.set(project.config, 'setupFiles', [localSetupFile, ...setupFiles])
    disableScreenshotFailures(Reflect.get(project.config, 'browser'))
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
        const setupFilePath = Option.getOrElse(Option.fromNullishOr(input.setupFilePath), () => defaultSetupPath)
        yield* fsService.copyFile(setupFilePath, localSetupFile).pipe(
          Effect.mapError((cause) =>
            new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause: errorToString(cause) })
          ),
        )
        const resolver = Option.getOrElse(Option.fromNullishOr(input.resolveVitestFor), () => resolveVitest)
        const { createVitest, version } = yield* resolver(projectRoot).pipe(
          Effect.provideService(Module, moduleService),
          Effect.provideService(FileSystem.FileSystem, fsService),
          Effect.provideService(Path.Path, pathService),
          Effect.catchDefect((cause) =>
            Effect.fail(new TestRunnerFailed({ runnerName: 'vitest', phase: 'init', cause: errorToString(cause) }))
          ),
        )
        const namespace = Option.getOrElse(
          Option.fromNullishOr(input.globalNamespace),
          () => INSTRUMENTER_CONSTANTS.NAMESPACE,
        )
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
              resolve: { alias: [...aliases], conditions: ['import'] },
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
      const getFileMeta = (file: unknown): unknown => Option.getOrUndefined(propertyOf(file, 'meta'))
      const readHitCount: Effect.Effect<number, CoverageDecodeFailed> = Effect.gen(function*() {
        const ctx = yield* requireCtx.pipe(Effect.mapError((cause) => new CoverageDecodeFailed({ cause })))
        const hitCounts = yield* Effect.forEach(
          experimentalStateGetFiles(ctx),
          (file) =>
            Effect.map(
              S.decodeUnknownEffect(HitCountMetaSchema)(getFileMeta(file)).pipe(
                Effect.mapError((cause) => new CoverageDecodeFailed({ cause })),
                Effect.orElseSucceed(() => ({ hitCount: undefined })),
              ),
              (decoded) => Option.getOrElse(Option.fromNullishOr(decoded.hitCount), () => 0),
            ),
        )
        return hitCounts.reduce((total, count) => total + count, 0)
      })
      const stringProperty = (value: unknown, key: string): string =>
        Option.getOrElse(Option.filter(propertyOf(value, key), Predicate.isString), () => '')

      const dedupeFilesByName = (files: readonly unknown[]): Record<string, unknown> =>
        Object.fromEntries(
          files.map((file) => [`${stringProperty(file, 'projectName')}-${stringProperty(file, 'name')}`, file]),
        )

      const validateCoverage = (
        mutantCoverage: DryRunMutantCoverage,
      ): Effect.Effect<DryRunMutantCoverage, CoverageDecodeFailed> => {
        const normalized = normalizeCoverage(mutantCoverage, input.sandboxDirectory, pathService)
        return S.decodeEffect(MutantCoverageShapeSchema)(normalized).pipe(
          Effect.mapError((cause) => new CoverageDecodeFailed({ cause })),
          Effect.map(() => normalized),
        )
      }

      const coverageOfFile = (
        file: unknown,
      ): Effect.Effect<DryRunMutantCoverage | undefined, CoverageDecodeFailed> =>
        Effect.gen(function*() {
          const decoded = yield* S.decodeUnknownEffect(MutantCoverageMetaSchema)(getFileMeta(file)).pipe(
            Effect.mapError((cause) => new CoverageDecodeFailed({ cause })),
            Effect.orElseSucceed(() => ({ mutantCoverage: undefined })),
          )
          return yield* Option.match(Option.fromNullishOr(decoded.mutantCoverage), {
            onNone: () => Effect.succeed(undefined),
            onSome: (mutantCoverage) => validateCoverage(mutantCoverage),
          })
        })

      const mergeTestCoverage = (
        perTest: Record<string, CoverageData>,
        testId: string,
        coverage: CoverageData,
      ): void =>
        Option.match(Option.fromNullishOr(perTest[testId]), {
          onNone: (): void => {
            perTest[testId] = coverage
          },
          onSome: (existing): void => {
            mergeCoverage(existing, coverage)
          },
        })

      const mergeProjectCoverage = (
        acc: DryRunMutantCoverage,
        projectCoverage: DryRunMutantCoverage,
      ): DryRunMutantCoverage => {
        for (const [testId, testCoverage] of Object.entries(projectCoverage.perTest)) {
          mergeTestCoverage(acc.perTest, testId, testCoverage)
        }
        mergeCoverage(acc.static, projectCoverage.static)
        return acc
      }

      const readMutantCoverage: Effect.Effect<DryRunMutantCoverage | undefined, CoverageDecodeFailed> = Effect.gen(
        function*() {
          const ctx = yield* requireCtx.pipe(Effect.mapError((cause) => new CoverageDecodeFailed({ cause })))
          const files = Object.values(dedupeFilesByName(experimentalStateGetFiles(ctx)))
          const coverages = (yield* Effect.forEach(files, coverageOfFile)).filter(Predicate.isNotNullish)
          return Option.getOrUndefined(
            Option.map(Option.fromNullishOr(coverages[0]), (first) =>
              coverages.slice(1).reduce(mergeProjectCoverage, first)),
          )
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
          const related = relatedFilesOf(Reflect.get(vitestInRun satisfies object, 'related'), filter.relatedFiles)
          const plan = runFilterPlan(filter, input.sandboxDirectory, pathService)
          applyRunFilterToConfig(ctx, { related, testNamePattern: plan.testNamePattern })
          yield* Effect.tryPromise({
            try: () =>
              ctx.start(plan.testFiles),
            catch: (cause) =>
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) }),
          }).pipe(
            Effect.catchIf((error: TestRunnerFailed) => isMissingTestFilesCause(error.cause), () => Effect.void),
          )
          const allFiles = experimentalStateGetFiles(ctx)
          const rawTests = allFiles.flatMap((
            file,
          ) => ((() => {
            if (isRunnerTestSuite(file)) return collectTestsFromSuite(file satisfies RunnerTestSuite)
            return []
          })())).filter((test) => (test satisfies RunnerTestCase).result !== undefined)
          const hasExternalError = experimentalStateHasExternalErrors(ctx)
          const externalErrorText = Match.value(hasExternalError).pipe(
            Match.when(true, () => experimentalStateGetExternalErrorText(ctx)),
            Match.orElse((): string => ''),
          )
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
            applyHarnessValue(ctx, key, value)
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
        ) =>
          Result.succeed(
            new VitestMutantRunCommand({
              rawTests: raw.rawTests,
              projectRoot: raw.projectRoot,
              hasExternalError: raw.hasExternalError,
              externalErrorText: raw.externalErrorText,
              hitCount: raw.hitCount,
              hitLimit: raw.hitLimit,
              reportAllKillers: raw.reportAllKillers,
            }),
          ),
        decide: interpretVitestRun,
        encode: (outcome: Result.Result<VitestMutantRunOutput, VitestMutantRunError>) =>
          Result.match(outcome, {
            onFailure: (e) => ({ status: 'error' as const, errorMessage: e.message }) satisfies MutantRunResult,
            onSuccess: (out) => {
              const nrOfTests = (): number => countIdRecords(parseJson(out.testsJson))
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
      const dryRunFilter = (options: Parameters<TestRunner['Service']['dryRun']>[0]): RunFilter => {
        const relatedFiles = Option.getOrUndefined(
          Option.map(Option.fromNullishOr(options.files), (files) => [...files]),
        )
        return Match.value(testFilesProvided(options)).pipe(
          Match.when(true, (): RunFilter => ({
            testFiles: Option.getOrElse(
              Option.map(Option.fromNullishOr(options.testFiles), (files) => [...files]),
              (): string[] => [],
            ),
            relatedFiles,
          })),
          Match.orElse((): RunFilter => ({ relatedFiles })),
        )
      }

      const completeDryRun = (testsJson: string): Effect.Effect<DryRunResult, TestRunnerFailed> =>
        Effect.gen(function*() {
          const tests: readonly TestResult[] = Match.value(parseJson(testsJson)).pipe(
            Match.when(Array.isArray, (entries) => entries.filter(isTestResultLike)),
            Match.orElse((): readonly TestResult[] => []),
          )
          const mutantCoverage = yield* readMutantCoverage.pipe(
            Effect.mapError((cause) =>
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) })
            ),
          )
          return Match.value(mutantCoverage).pipe(
            Match.when(Match.defined, (coverage) => ({ status: 'complete' as const, tests, mutantCoverage: coverage })),
            Match.orElse((): DryRunResult => ({ status: 'complete' as const, tests })),
          )
        })

      const dryRun: TestRunner['Service']['dryRun'] = (options) =>
        Effect.gen(function*() {
          const harness = yield* VitestHarness
          yield* harness.setMode('dry-run')
          const filter = dryRunFilter(options)
          const { rawTests, hasExternalError, externalErrorText } = yield* collectRaw(filter)
          const decision: VitestDryRunOutcome = decideVitestDryRun(
            new VitestDryRunCommand({
              rawTests,
              projectRoot: input.sandboxDirectory,
              hasExternalError,
              externalErrorText,
            }),
          )
          return yield* Match.value(decision).pipe(
            Match.tag(
              'Error',
              (error): Effect.Effect<DryRunResult, TestRunnerFailed> =>
                Effect.succeed(
                  { status: 'error' as const, errorMessage: error.errorMessage } satisfies DryRunResult,
                ),
            ),
            Match.tag('Complete', (complete) => completeDryRun(complete.testsJson)),
            Match.exhaustive,
          )
        }).pipe(
          Effect.provideService(VitestHarness, harnessImpl),
          Effect.mapError((cause) => ((() => {
            if (cause instanceof TestRunnerFailed) return cause
            return new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) })
          })())),
        )
      const mutantRun: TestRunner['Service']['mutantRun'] = (options) =>
        mutantRunCell.run(options).pipe(
          Effect.provideService(VitestHarness, harnessImpl),
          Effect.mapError((cause) => ((() => {
            if (cause instanceof TestRunnerFailed) return cause
            return new TestRunnerFailed({ runnerName: 'vitest', phase: 'mutantRun', cause: errorToString(cause) })
          })())),
        )
      const disposeContext = (
        ctx: Vitest,
        localSetupFile: string | undefined,
      ): Effect.Effect<void, TestRunnerFailed> =>
        Effect.gen(function*() {
          Option.match(Option.fromNullishOr(localSetupFile), {
            onNone: (): void => undefined,
            onSome: (file): void => {
              ctx.onClose(() =>
                Effect.runPromise(
                  fsService.remove(file, { recursive: true, force: true }).pipe(
                    Effect.orElseSucceed(() => undefined),
                  ),
                )
              )
            },
          })
          yield* Effect.tryPromise({
            try: () => ctx.close(),
            catch: (cause) =>
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'dispose', cause: errorToString(cause) }),
          })
        })

      const dispose: TestRunner['Service']['dispose'] = Effect.gen(function*() {
        const state = yield* getState
        return yield* Option.match(Option.fromNullishOr(state.ctx), {
          onNone: () => Effect.void,
          onSome: (ctx) => disposeContext(ctx, state.localSetupFile),
        })
      })
      return TestRunner.of({ capabilities, init, dryRun, mutantRun, dispose })
    }),
  )

function isTestResultLike(value: unknown): value is TestResult {
  return Predicate.isObject(value) && typeof value['id'] === 'string'
}

function countIdRecords(raw: unknown): number {
  return Match.value(raw).pipe(
    Match.when(Array.isArray, (entries) => entries.filter(isTestResultLike).length),
    Match.orElse((): number => 0),
  )
}

const mergeHitCount = (to: CoverageData, mutantId: string, hitCount: number): void =>
  Option.match(Option.fromNullishOr(to[mutantId]), {
    onNone: (): void => {
      to[mutantId] = hitCount
    },
    onSome: (existing): void => {
      to[mutantId] = existing + hitCount
    },
  })

function mergeCoverage(to: CoverageData, from: CoverageData): void {
  for (const [mutantId, hitCount] of Object.entries(from)) {
    mergeHitCount(to, mutantId, hitCount)
  }
}
