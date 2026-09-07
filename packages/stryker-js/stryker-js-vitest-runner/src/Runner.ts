import type * as PathType from 'effect/Path'
import type { Vitest } from 'vitest/node'
import { createVitest as createVitestOriginal } from 'vitest/node'

import { Cell } from '@systemfsoftware/effect-cell-types'
import { Module } from '@systemfsoftware/stryker-js/Module'
import {
  type CoverageData,
  errorToString,
  INSTRUMENTER_CONSTANTS,
  normalizeFileName,
} from '@systemfsoftware/stryker-js/Mutant'
import { PluginBuildError, RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import {
  type DryRunOptions,
  DryRunResult,
  type MutantCoverage as DryRunMutantCoverage,
  type MutantRunOptions,
  MutantRunResult,
  testFilesProvided,
  TestRunner,
  TestRunnerFailed,
} from '@systemfsoftware/stryker-js/TestRunner'
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
import type { VitestTask, VitestTestTask } from './Runner.schema.js'
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
  VitestTaskArray,
} from './Runner.schema.js'

function fromTestId(id: string): { file: string; test: string } {
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

function isErrorCodeError(error: unknown): error is Error & { code: string } {
  if (error instanceof Error && 'code' in error) {
    const code = Reflect.get(error, 'code')
    return typeof code === 'string'
  }
  return false
}

const VITEST_ERROR_CODES = Object.freeze({ FILES_NOT_FOUND: 'VITEST_FILES_NOT_FOUND' })

const SOURCE_CONDITION = '@systemfsoftware/source'

const leafTasks = (task: VitestTask): readonly VitestTestTask[] => {
  if ('tasks' in task) {
    return task.tasks.flatMap(leafTasks)
  }
  return [task]
}

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
  closed: boolean
  ctx: Vitest | undefined
  localSetupFile: string | undefined
}

const collectedFiles = (vitest: Vitest): readonly unknown[] => vitest.state.getFiles()
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

export const makeVitestRunnerLayer = (): Layer.Layer<
  TestRunner,
  PluginBuildError,
  Module | FileSystem.FileSystem | Path.Path | RunConfiguration | SandboxDirectory
> =>
  Layer.effect(
    TestRunner,
    Effect.gen(function*() {
      const options = yield* RunConfiguration
      const input = { options, sandboxDirectory: yield* SandboxDirectory }
      const stateRef = yield* Ref.make<RunnerState>({ closed: false, ctx: undefined, localSetupFile: undefined })
      const fsService = yield* FileSystem.FileSystem
      const pathService = yield* Path.Path
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
            new TestRunnerFailed({ runnerName: 'vitest', phase: 'connect', cause: errorToString(cause) })
          ),
        )
      const rawVitest = Reflect.get(input.options, 'vitest')
      const optionsEffect = decodedOptionsEffect(rawVitest).pipe(
        Effect.map((vitestOptions) => ({ ...input.options, vitest: vitestOptions })),
      )
      const capabilities: TestRunner['Service']['capabilities'] = Effect.succeed({ reloadEnvironment: true })
      yield* Effect.acquireRelease(
        Effect.gen(function*() {
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
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'connect', cause: errorToString(cause) })
            ),
          )
          yield* fsService.copyFile(defaultSetupPath, localSetupFile).pipe(
            Effect.mapError((cause) =>
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'connect', cause: errorToString(cause) })
            ),
          )
          const { createVitest, version } = yield* resolveVitest(projectRoot).pipe(
            Effect.catchDefect((cause) =>
              Effect.fail(new TestRunnerFailed({ runnerName: 'vitest', phase: 'connect', cause: errorToString(cause) }))
            ),
          )
          const namespace = INSTRUMENTER_CONSTANTS.NAMESPACE
          const scanDir = (() => {
            if (typeof options.vitest.dir === 'string') return pathService.resolve(projectRoot, options.vitest.dir)
            return undefined
          })()
          const aliases = yield* readSandboxSelfAliases(projectRoot)
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
            catch: (cause) =>
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'connect', cause: errorToString(cause) }),
          })
          ctx.provide('globalNamespace', namespace)
          ctx.provide('isGreaterThanVitest4Point1', shouldUseSuiteMetaSecondArg(version))
          applySetupFilesToProjects(ctx, localSetupFile)
          yield* Ref.update(stateRef, (s) => ({ ...s, ctx }))
          return ctx
        }),
        (ctx) =>
          Effect.gen(function*() {
            const state = yield* Ref.get(stateRef)
            if (state.closed) return
            const localSetupFile = state.localSetupFile
            yield* Ref.update(stateRef, (s) => ({ ...s, closed: true, ctx: undefined, localSetupFile: undefined }))
            yield* Effect.tryPromise({ try: () => ctx.close(), catch: () => undefined }).pipe(Effect.ignore)
            if (localSetupFile !== undefined) {
              yield* fsService.remove(localSetupFile, { recursive: true, force: true }).pipe(Effect.ignore)
            }
          }),
      )
      const resetContext = Effect.gen(function*() {
        const ctx = yield* requireCtx
        for (const project of ctx.projects) {
          ctx.state.clearFiles(project)
        }
      })
      const getFileMeta = (file: unknown): unknown => ((() => {
        if (file !== null && typeof file === 'object' && 'meta' in file) return Reflect.get(file, 'meta')
        return undefined
      })())
      const readHitCount: Effect.Effect<number, CoverageDecodeFailed> = Effect.gen(function*() {
        const ctx = yield* requireCtx.pipe(Effect.mapError((cause) => new CoverageDecodeFailed({ cause })))
        const files = collectedFiles(ctx)
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
          const files = collectedFiles(ctx)
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
        request: { mode: 'dry-run' | 'mutant'; hitLimit?: number | undefined } & RunFilter,
      ): Effect.Effect<
        { rawFiles: readonly unknown[]; hasExternalError: boolean; externalErrorText: string },
        TestRunnerFailed
      > =>
        Effect.gen(function*() {
          const ctx = yield* requireCtx
          const options = yield* optionsEffect
          ctx.provide('mode', request.mode)
          if (request.mode === 'mutant') {
            ctx.provide('hitLimit', request.hitLimit ?? undefined)
          }
          yield* resetContext.pipe(
            Effect.mapError((cause) =>
              new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) })
            ),
          )
          const vitestInRun = Reflect.get(options, 'vitest')
          const relatedValue = Reflect.get(vitestInRun satisfies object, 'related')
          const related: string[] | undefined = (() => {
            if (relatedValue !== false && request.relatedFiles !== undefined) {
              return request.relatedFiles.map(normalizeFileName)
            }
            return undefined
          })()
          let testFilesToRun: string[] | undefined = (() => {
            if (request.testFiles !== undefined) return [...request.testFiles]
            return undefined
          })()
          let pattern: RegExp | undefined
          if ((request.testIds ?? []).length > 0) {
            const parsedTests = (request.testIds ?? []).map(fromTestId)
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
          const rawFiles = collectedFiles(ctx)
          const unhandled = ctx.state.getUnhandledErrors()
          const hasExternalError = unhandled.length > 0
          const externalErrorText = unhandled.map(errorToString).join('\n')
          return { rawFiles, hasExternalError, externalErrorText }
        })
      const mutantRunCell = Cell.layer({
        read: (command: MutantRunOptions) =>
          Effect.gen(function*() {
            const { rawFiles, hasExternalError, externalErrorText } = yield* collectRaw({
              mode: 'mutant',
              hitLimit: command.hitLimit,
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
                rawFiles,
                projectRoot: input.sandboxDirectory,
                hasExternalError,
                externalErrorText,
                hitLimit: command.hitLimit,
                reportAllKillers,
              }
            }
            return {
              rawFiles,
              projectRoot: input.sandboxDirectory,
              hasExternalError,
              externalErrorText,
              hitCount,
              hitLimit: command.hitLimit,
              reportAllKillers,
            }
          }),
        decode: (raw) => {
          const base = {
            projectRoot: raw.projectRoot,
            hasExternalError: raw.hasExternalError,
            externalErrorText: raw.externalErrorText,
            reportAllKillers: raw.reportAllKillers,
          }
          return Result.match(S.decodeUnknownResult(VitestTaskArray)(raw.rawFiles), {
            onFailure: (cause) =>
              Result.fail(
                new TestRunnerFailed({
                  runnerName: 'vitest',
                  phase: 'mutantRun',
                  cause: errorToString(cause),
                }),
              ),
            onSuccess: (files) => {
              const tests = files.flatMap(leafTasks)
              if (raw.hitCount !== undefined) {
                if (raw.hitLimit !== undefined) {
                  return Result.succeed(
                    new VitestMutantRunCommand({
                      ...base,
                      tests,
                      hitCount: raw.hitCount,
                      hitLimit: raw.hitLimit,
                    }),
                  )
                }
                return Result.succeed(
                  new VitestMutantRunCommand({ ...base, tests, hitCount: raw.hitCount }),
                )
              }
              if (raw.hitLimit !== undefined) {
                return Result.succeed(
                  new VitestMutantRunCommand({ ...base, tests, hitLimit: raw.hitLimit }),
                )
              }
              return Result.succeed(new VitestMutantRunCommand({ ...base, tests }))
            },
          })
        },
        decide: interpretVitestRun,
        encode: (outcome: Result.Result<VitestMutantRunOutput, VitestMutantRunError>) =>
          Result.match(outcome, {
            onFailure: (e) => ({ status: 'error' as const, errorMessage: e.message }) satisfies MutantRunResult,
            onSuccess: (out) =>
              Match.value(out).pipe(
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
                      nrOfTests: killed.tests.length,
                    }) satisfies MutantRunResult,
                ),
                Match.tag(
                  'Survived',
                  (survived) =>
                    ({ status: 'survived' as const, nrOfTests: survived.tests.length }) satisfies MutantRunResult,
                ),
                Match.exhaustive,
              ),
          }),
        write: (output: MutantRunResult, _raw: unknown) => Effect.succeed(output),
      })
      const dryRunCell = Cell.layer({
        read: (options: DryRunOptions) =>
          Effect.gen(function*() {
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
            const { rawFiles, hasExternalError, externalErrorText } = yield* collectRaw({
              mode: 'dry-run',
              ...filter,
            })
            return { rawFiles, hasExternalError, externalErrorText, projectRoot: input.sandboxDirectory }
          }),
        decode: (raw) => {
          const base = {
            projectRoot: raw.projectRoot,
            hasExternalError: raw.hasExternalError,
            externalErrorText: raw.externalErrorText,
            reportAllKillers: false,
          }
          return Result.match(S.decodeUnknownResult(VitestTaskArray)(raw.rawFiles), {
            onFailure: (cause) =>
              Result.fail(
                new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) }),
              ),
            onSuccess: (files) =>
              Result.succeed(new VitestMutantRunCommand({ ...base, tests: files.flatMap(leafTasks) })),
          })
        },
        decide: interpretVitestRun,
        encode: (outcome: Result.Result<VitestMutantRunOutput, VitestMutantRunError>) =>
          Result.match(outcome, {
            onFailure: (error) => ({ status: 'error' as const, errorMessage: error.message }) satisfies DryRunResult,
            onSuccess: (out) =>
              Match.value(out).pipe(
                Match.tag(
                  'Killed',
                  (killed) => ({ status: 'complete' as const, tests: killed.tests }) satisfies DryRunResult,
                ),
                Match.tag(
                  'Survived',
                  (survived) => ({ status: 'complete' as const, tests: survived.tests }) satisfies DryRunResult,
                ),
                Match.tag(
                  'Timeout',
                  () =>
                    ({
                      status: 'error' as const,
                      errorMessage: 'The initial test run hit its limit',
                    }) satisfies DryRunResult,
                ),
                Match.exhaustive,
              ),
          }),
        write: (output: DryRunResult) =>
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
          }),
      })
      const dryRun: TestRunner['Service']['dryRun'] = (options) =>
        Cell.run(dryRunCell, options).pipe(
          Effect.mapError((cause) => ((() => {
            if (cause instanceof TestRunnerFailed) return cause
            return new TestRunnerFailed({ runnerName: 'vitest', phase: 'dryRun', cause: errorToString(cause) })
          })())),
        )
      const mutantRun: TestRunner['Service']['mutantRun'] = (options) =>
        Cell.run(mutantRunCell, options).pipe(
          Effect.mapError((cause) => ((() => {
            if (cause instanceof TestRunnerFailed) return cause
            return new TestRunnerFailed({ runnerName: 'vitest', phase: 'mutantRun', cause: errorToString(cause) })
          })())),
        )
      return TestRunner.of({ capabilities, dryRun, mutantRun })
    }).pipe(
      Effect.mapError((failure) => new PluginBuildError({ name: 'vitest', cause: failure })),
    ),
  )

function mergeCoverage(to: CoverageData, from: CoverageData): void {
  for (const [mutantId, hitCount] of Object.entries(from)) {
    if (mutantId in to) to[mutantId] = to[mutantId] + hitCount
    else to[mutantId] = hitCount
  }
}
