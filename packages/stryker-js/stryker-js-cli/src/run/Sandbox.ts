import { parse } from '@std/jsonc'
import { errorToString } from '@systemfsoftware/stryker-js'
import { normalizeFileName } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import { Schema as S } from 'effect'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'
import { disableTypeChecks } from '../instrument/index.js'
import type { ParserContribution } from '../instrument/index.js'

import { createFileMatcher, isWarningEnabled, optionsPath } from './Config.js'
import {
  backupTo,
  FILE_CONCURRENCY,
  hasChanges,
  readContent,
  toInstrumenterFile,
  withContent,
  writeInPlace,
  writeToSandbox,
} from './Project.js'
import type { ProjectFile } from './Project.js'
import type { Project } from './Project.js'
import { ExtendsArraySchema, type TSConfig, TsConfigParseError, TsConfigSchema } from './Sandbox.schema.js'
import { StrykerError } from './stryker-error.schema.js'

export interface SandboxHandle {
  readonly workingDirectory: string
  readonly sandboxFileFor: (fileName: string) => string
  readonly originalFileFor: (sandboxFileName: string) => string
}

export interface MakeSandboxInput {
  readonly options: StrykerOptions
  readonly project: Project
  readonly workingDirectory: string
  readonly backupDirectory: string
  readonly basePath: string
  readonly parsers: readonly ParserContribution[]
}

/**
 * A preprocessor refines files before they are written to the sandbox.
 * It rewrites references in tsconfig files or inserts `// @ts-nocheck`.
 */
type FilePreprocessor = (
  project: Project,
) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>

const combinePreprocessors = (preprocessors: readonly FilePreprocessor[]): FilePreprocessor => (project) =>
  Effect.forEach(preprocessors, (pre) => pre(project), { discard: true })

const makeDisableTypeChecksPreprocessor =
  (options: StrykerOptions, impl: typeof disableTypeChecks, parsers: readonly ParserContribution[]): FilePreprocessor =>
  (project) => {
    return Effect.gen(function*() {
      const pathService = yield* Path.Path
      const matches = createFileMatcher(options.disableTypeChecks, pathService)
      const updates = yield* Effect.forEach([...project.files], ([name, file]) => {
        if (!matches(pathService.resolve(name))) {
          return Effect.succeed<ProjectFile | undefined>(undefined)
        }
        return Effect.gen(function*() {
          const instrumenterFile = yield* toInstrumenterFile(file)
          const content = yield* Effect.tryPromise({
            try: () => impl(instrumenterFile, parsers).then((r) => r.content),
            catch: (cause) => new StrykerError({ message: 'disableTypeChecks failed', cause }),
          }).pipe(
            Effect.catch((_error) =>
              Effect.gen(function*() {
                if (isWarningEnabled('preprocessorErrors', options.warnings)) {
                  yield* Effect.logWarning(
                    `Unable to disable type checking for file "${name}". Shouldn't type checking be disabled for this file? Consider configuring a more restrictive "${
                      optionsPath('disableTypeChecks')
                    }" settings (or turn it completely off with \`false\`)`,
                  )
                }
                return undefined
              })
            ),
          )
          if (content !== undefined) {
            return withContent(file, content)
          }
          return undefined
        })
      }, { concurrency: FILE_CONCURRENCY })
      updates.forEach((updated) => {
        if (updated !== undefined) {
          mergeUpdatedFile(project, updated)
        }
      })
    })
  }

const mergeUpdatedFile = (project: Project, updated: ProjectFile): void => {
  const key = updated.name
  MutableHashMap.set(project.files, key, updated)
  if (Option.isSome(MutableHashMap.get(project.filesToMutate, key))) {
    MutableHashMap.set(project.filesToMutate, key, updated)
  }
}

const tsConfigParseError = (file: string, reason: string): TsConfigParseError =>
  new TsConfigParseError({ file, reason, exitClass: 'ConfigError' })

const parseJsonText = (jsonText: string): Result.Result<unknown, string> => {
  try {
    return Result.succeed(parse(jsonText.replace(/^\uFEFF/, '')))
  } catch (error) {
    return Result.fail(errorToString(error))
  }
}

const parseTsConfigShape = (fileName: string, parsed: unknown): Result.Result<TSConfig, TsConfigParseError> =>
  Match.value(parsed).pipe(
    Match.when(
      S.is(TsConfigSchema),
      (config): Result.Result<TSConfig, TsConfigParseError> => Result.succeed(config),
    ),
    Match.orElse(
      (): Result.Result<TSConfig, TsConfigParseError> =>
        Result.fail(
          tsConfigParseError(
            fileName,
            `parsed to ${JSON.stringify(parsed)}, which does not match the tsconfig shape this package consumes`,
          ),
        ),
    ),
  )

export function parseTsConfig(
  fileName: string,
  jsonText: string,
): Result.Result<TSConfig, TsConfigParseError> {
  return Result.match(parseJsonText(jsonText), {
    onFailure: (reason) => Result.fail(tsConfigParseError(fileName, reason)),
    onSuccess: (parsed) => parseTsConfigShape(fileName, parsed),
  })
}

const makeTSConfigPreprocessor = (options: StrykerOptions, basePath: string): FilePreprocessor => (project) => {
  if (options.inPlace) {
    return Effect.void
  }
  const tryRewriteReference = (
    reference: string,
    originTSConfigFileName: string,
    pathService: Path.Path,
  ): string | false => {
    const fileName = pathService.resolve(pathService.dirname(originTSConfigFileName), reference)
    const relativeToSandbox = pathService.relative(basePath, fileName)
    if (relativeToSandbox.startsWith('..')) {
      return ['..', '..', normalizeFileName(reference)].join('/')
    }
    return false
  }

  const rewriteReferenceOrKeep = (reference: string, tsconfigFileName: string, pathService: Path.Path): string =>
    Match.value(tryRewriteReference(reference, tsconfigFileName, pathService)).pipe(
      Match.when(Predicate.isString, (rewritten) => rewritten),
      Match.orElse(() => reference),
    )

  const rewriteEntryAtIndex = (
    value: unknown[],
    index: number,
    tsconfigFileName: string,
    pathService: Path.Path,
  ): void => {
    const entry = value[index]
    if (typeof entry !== 'string') {
      return
    }
    value[index] = rewriteReferenceOrKeep(entry, tsconfigFileName, pathService)
  }

  const rewriteFileArrayProperty = (
    config: TSConfig,
    tsconfigFileName: string,
    prop: 'exclude' | 'files' | 'include',
    pathService: Path.Path,
  ): void => {
    const value = config[prop]
    if (Array.isArray(value)) {
      value.forEach((_entry, index) => rewriteEntryAtIndex(value, index, tsconfigFileName, pathService))
    }
  }

  const rewriteTSConfigFile = (
    tsconfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> => {
    const tsconfigFileOpt = MutableHashMap.get(project.files, tsconfigFileName)
    if (Option.isNone(tsconfigFileOpt)) {
      return Effect.void
    }
    const tsconfigFile = tsconfigFileOpt.value
    return Effect.flatMap(
      readContent(tsconfigFile),
      (content) =>
        Effect.flatMap(Effect.sync(() => parseTsConfig(tsconfigFileName, content)), (parsed) => {
          if (Result.isSuccess(parsed)) {
            const config = parsed.success
            return Effect.all(
              [
                rewriteExtends(config, tsconfigFileName, pathService),
                rewriteProjectReferences(config, tsconfigFileName, pathService),
              ],
              { discard: true },
            ).pipe(
              Effect.flatMap(() =>
                Effect.sync(() => {
                  rewriteFileArrayProperty(config, tsconfigFileName, 'include', pathService)
                  rewriteFileArrayProperty(config, tsconfigFileName, 'exclude', pathService)
                  rewriteFileArrayProperty(config, tsconfigFileName, 'files', pathService)
                  Object.assign(tsconfigFile, { content: JSON.stringify(config, null, 2) })
                })
              ),
            )
          }
          const reason = parsed.failure.reason
          return Effect.logWarning(
            `Could not rewrite tsconfig file "${tsconfigFileName}": ${reason}. Its extends, project references, and file array properties were not rewritten for the sandbox, so this file still points at paths outside it.`,
          )
        }),
    )
  }

  const rewriteExtendsEntry = (
    config: TSConfig,
    extend: string,
    tsconfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> => {
    const rewritten = tryRewriteReference(extend, tsconfigFileName, pathService)
    if (rewritten !== false) {
      return Effect.succeed(rewritten)
    }
    return rewriteTSConfigFile(
      pathService.resolve(pathService.dirname(tsconfigFileName), extend),
      pathService,
    ).pipe(Effect.as(extend))
  }

  const rewriteSingleExtends = (
    config: TSConfig,
    extend: string,
    tsconfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
    Effect.flatMap(rewriteExtendsEntry(config, extend, tsconfigFileName, pathService), (rewritten) => {
      config.extends = rewritten
      return Effect.void
    })

  const rewriteExtendsArray = (
    config: TSConfig,
    extendEntries: readonly string[],
    tsconfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
    Effect.forEach(extendEntries, (entry) => rewriteExtendsEntry(config, entry, tsconfigFileName, pathService)).pipe(
      Effect.flatMap((rewritten) => {
        config.extends = rewritten
        return Effect.void
      }),
    )

  const rewriteExtends = (
    config: TSConfig,
    tsconfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
    Match.value(config.extends).pipe(
      Match.when(Predicate.isString, (extend) => rewriteSingleExtends(config, extend, tsconfigFileName, pathService)),
      Match.when(S.is(ExtendsArraySchema), (extendEntries) =>
        rewriteExtendsArray(config, extendEntries, tsconfigFileName, pathService)),
      Match.orElse(() =>
        Effect.void
      ),
    )

  const referencedTsConfigPath = (referencePath: string): string =>
    Match.value(referencePath.endsWith('.json')).pipe(
      Match.when(true, () => referencePath),
      Match.orElse(() => `${referencePath}/tsconfig.json`),
    )

  const rewriteReference = (
    ref: { path: string },
    originTSConfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
    Match.value(tryRewriteReference(ref.path, originTSConfigFileName, pathService)).pipe(
      Match.when(Predicate.isString, (rewritten) => {
        ref.path = rewritten
        return Effect.void
      }),
      Match.orElse(() =>
        rewriteTSConfigFile(
          pathService.resolve(pathService.dirname(originTSConfigFileName), referencedTsConfigPath(ref.path)),
          pathService,
        )
      ),
    )

  const rewriteProjectReferences = (
    config: TSConfig,
    originTSConfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> => {
    const references = config.references
    if (!references) {
      return Effect.void
    }
    return Effect.forEach(references, (ref) => rewriteReference(ref, originTSConfigFileName, pathService))
      .pipe(Effect.asVoid)
  }

  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    return yield* rewriteTSConfigFile(pathService.resolve(options.tsconfigFile), pathService)
  })
}

const createPreprocessor = (
  options: StrykerOptions,
  basePath: string,
  parsers: readonly ParserContribution[],
): FilePreprocessor =>
  combinePreprocessors([
    makeDisableTypeChecksPreprocessor(options, disableTypeChecks, parsers),
    makeTSConfigPreprocessor(options, basePath),
  ])

export interface TemporaryDirectoryShape {
  readonly path: string
}

export class TemporaryDirectory extends Context.Service<TemporaryDirectory, TemporaryDirectoryShape>()(
  '@systemfsoftware/stryker-js-cli/run/TemporaryDirectory',
) {}

const removesTempDir = (exit: Exit.Exit<unknown, unknown>, cleanTempDir: 'always' | boolean): boolean =>
  Exit.isSuccess(exit) || cleanTempDir === 'always'

const removeEmptyParentDirectory = (
  parent: string,
  fs: FileSystem.FileSystem,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function*() {
    const siblings = yield* fs.readDirectory(parent)
    if (siblings.length === 0) {
      yield* fs.remove(parent, { recursive: true, force: true })
    }
  })

const removeTempDirectory = (
  tmp: string,
  parent: string,
  fs: FileSystem.FileSystem,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function*() {
    yield* Effect.logDebug(`Deleting stryker temp directory ${tmp}`)
    yield* fs.remove(tmp, { recursive: true, force: true })
    if (yield* fs.exists(parent)) {
      yield* removeEmptyParentDirectory(parent, fs)
    }
  })

export const TemporaryDirectoryLive = (
  options: StrykerOptions,
): Layer.Layer<TemporaryDirectory, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    TemporaryDirectory,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const parent = path.resolve(options.tempDirName)
      yield* fs.makeDirectory(parent, { recursive: true })

      let prefix = 'sandbox-'
      if (options.inPlace) {
        prefix = 'backup-'
      }
      const tmp = yield* fs.makeTempDirectory({
        directory: parent,
        prefix,
      })

      yield* Effect.logDebug(`Using temp directory "${tmp}"`)

      yield* Effect.addFinalizer((exit) =>
        Effect.gen(function*() {
          if (removesTempDir(exit, options.cleanTempDir)) {
            yield* removeTempDirectory(tmp, parent, fs)
            return
          }
          yield* Effect.logDebug('Not removing the temp dir because an error occurred')
        }).pipe(Effect.orDie)
      )

      return { path: tmp }
    }),
  )

const toFileMap = (entries: readonly (readonly [string, string])[]): Map<string, string> => new Map(entries)

const directoryChain = (from: string, pathService: Path.Path): readonly string[] => {
  const parent = pathService.dirname(from)
  if (parent === from) {
    return [from]
  }
  return [from, ...directoryChain(parent, pathService)]
}

const binDirectoriesFrom = (from: string, pathService: Path.Path): string[] =>
  directoryChain(pathService.resolve(from), pathService).map((directory) =>
    pathService.join(directory, 'node_modules', '.bin')
  )

const inheritedPath = (): string =>
  Match.value(process.env['PATH']).pipe(
    Match.when(Predicate.isString, (value) => value),
    Match.orElse(() => ''),
  )

const failOnBuildFailure = (
  command: string,
  result: { readonly exitCode: number; readonly stderr: string },
): Effect.Effect<void, StrykerError> =>
  Match.value(result.exitCode).pipe(
    Match.when(
      (exitCode) => exitCode !== 0,
      (exitCode) =>
        Effect.fail(
          new StrykerError({
            message: `Build command "${command}" failed with exit code ${String(exitCode)}.\n${result.stderr}`,
          }),
        ),
    ),
    Match.orElse(() => Effect.void),
  )

const runBuildCommandIn = (
  command: string,
  workingDirectory: string,
): Effect.Effect<void, StrykerError, Path.Path | ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function*() {
    const pathService = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const separator = (() => {
      if (process.platform === 'win32') {
        return ';'
      }
      return ':'
    })()
    const inherited = inheritedPath()
    const binDirs = binDirectoriesFrom(workingDirectory, pathService)
    const newPath = [...binDirs, inherited].join(separator)

    const childCommand = ChildProcess.make(command, {
      shell: true,
      cwd: workingDirectory,
      env: { PATH: newPath },
      extendEnv: true,
    })
    const result = yield* Effect.scoped(
      Effect.gen(function*() {
        const handle = yield* spawner.spawn(childCommand)
        const stderrChunks = yield* Stream.runCollect(Stream.decodeText(handle.stderr)).pipe(
          Effect.map((chunks) => [...chunks].join('')),
          Effect.orElseSucceed(() => ''),
        )
        const exitCode = yield* handle.exitCode
        return { exitCode: Number(exitCode), stderr: stderrChunks }
      }),
    ).pipe(
      Effect.mapError((cause) => new StrykerError({ message: `Failed to spawn build command "${command}"`, cause })),
    )

    yield* failOnBuildFailure(command, result)
  })

type NodeModulesWalk = {
  readonly basePath: string
  readonly tempDirName: string | undefined
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly queue: string[]
  readonly found: string[]
}

type DirectoryRole = 'skipped' | 'nodeModules' | 'searchable'

const directoryRole = (dir: string, walk: NodeModulesWalk): DirectoryRole =>
  Match.value(walk.path.basename(dir)).pipe(
    Match.when((name) => name === walk.tempDirName, (): DirectoryRole => 'skipped'),
    Match.when((name) => name === 'node_modules', (): DirectoryRole => 'nodeModules'),
    Match.orElse((): DirectoryRole => 'searchable'),
  )

const enqueueChildDirectory = (
  dir: string,
  entry: string,
  walk: NodeModulesWalk,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function*() {
    const child = walk.path.join(dir, entry)
    const statType = yield* walk.fs.stat(walk.path.join(walk.basePath, child)).pipe(
      Effect.map((info) => info.type),
      Effect.orElseSucceed((): string => 'Unknown'),
    )
    if (statType === 'Directory') {
      walk.queue.push(child)
    }
  })

const enqueueChildDirectories = (dir: string, walk: NodeModulesWalk): Effect.Effect<void, PlatformError> =>
  Effect.gen(function*() {
    const entries = yield* walk.fs.readDirectory(walk.path.join(walk.basePath, dir)).pipe(
      Effect.orElseSucceed((): readonly string[] => []),
    )
    yield* Effect.forEach(entries, (entry) => enqueueChildDirectory(dir, entry, walk), {
      concurrency: 1,
      discard: true,
    })
  })

const visitDirectory = (dir: string, walk: NodeModulesWalk): Effect.Effect<void, PlatformError> =>
  Match.value(directoryRole(dir, walk)).pipe(
    Match.when('nodeModules', () =>
      Effect.sync(() => {
        walk.found.push(dir)
      })),
    Match.when('skipped', () => Effect.void),
    Match.orElse(() => enqueueChildDirectories(dir, walk)),
  )

const findNodeModulesList = (
  basePath: string,
  tempDirName: string | undefined,
): Effect.Effect<string[], PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const walk: NodeModulesWalk = {
      basePath,
      tempDirName,
      fs,
      path,
      queue: ['.'],
      found: [],
    }
    let dir = walk.queue.pop()
    while (dir !== undefined) {
      yield* visitDirectory(dir, walk)
      dir = walk.queue.pop()
    }
    return walk.found
  })

const symlinkJunction = (
  to: string,
  from: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fsService = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    yield* fsService.makeDirectory(pathService.dirname(from), { recursive: true })
    yield* fsService.symlink(to, from)
  })

const moveEntry = (
  from: string,
  to: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const stat = yield* fs.stat(from)
    if (stat.type === 'Directory') {
      yield* moveDirectoryRecursive(from, to)
    } else {
      yield* fs.rename(from, to).pipe(
        Effect.catch(() => fs.copyFile(from, to).pipe(Effect.andThen(fs.remove(from)))),
      )
    }
  })

const moveDirectoryRecursive = (
  from: string,
  to: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    if (!(yield* fs.exists(from))) {
      return
    }
    yield* fs.makeDirectory(to, { recursive: true })
    const entries = yield* fs.readDirectory(from)
    yield* Effect.forEach(
      entries,
      (entry) => moveEntry(pathService.join(from, entry), pathService.join(to, entry)),
      { concurrency: 1, discard: true },
    )
    yield* fs.remove(from, { recursive: true, force: true })
  })

const inPlaceSandboxFile = (
  name: string,
  file: ProjectFile,
  backupDirectory: string,
  basePath: string,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    if (!hasChanges(file)) {
      return name
    }
    yield* backupTo(file, backupDirectory, basePath)
    yield* Effect.logDebug('Stored backup file')
    yield* writeInPlace(file)
    return name
  })

const sandboxFile = (
  name: string,
  file: ProjectFile,
  workingDirectory: string,
  backupDirectory: string,
  basePath: string,
  options: StrykerOptions,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Match.value(options.inPlace).pipe(
    Match.when(true, () => inPlaceSandboxFile(name, file, backupDirectory, basePath)),
    Match.orElse(() => writeToSandbox(file, workingDirectory, basePath)),
  )

const sandboxFileNameOf = (fileMap: Map<string, string>, fileName: string): string =>
  Match.value(fileMap.get(fileName)).pipe(
    Match.when(Predicate.isString, (sandboxFileName) => sandboxFileName),
    Match.orElse((): string => {
      throw new StrykerError({ message: `Cannot find sandbox file for ${fileName}` })
    }),
  )

const withoutLeadingSeparator = (suffix: string): string =>
  Match.value(suffix.startsWith('/')).pipe(
    Match.when(true, () => suffix.slice(1)),
    Match.orElse(() => suffix),
  )

const relativeToBase = (
  resolvedSandbox: string,
  resolvedWorking: string,
  base: string,
  pathService: Path.Path,
): string => {
  const trimmed = withoutLeadingSeparator(resolvedSandbox.slice(resolvedWorking.length))
  return Match.value(trimmed.length === 0).pipe(
    Match.when(true, () => base),
    Match.orElse(() => pathService.join(base, trimmed)),
  )
}

const originalFileNameOf = (
  sandboxFileName: string,
  workingDirectory: string,
  base: string,
  pathService: Path.Path,
): string => {
  const resolvedSandbox = pathService.resolve(sandboxFileName)
  const resolvedWorking = pathService.resolve(workingDirectory)
  return Match.value(resolvedSandbox.startsWith(resolvedWorking)).pipe(
    Match.when(true, () => relativeToBase(resolvedSandbox, resolvedWorking, base, pathService)),
    Match.orElse(() => resolvedSandbox.replace(resolvedWorking, base)),
  )
}

const buildSandboxHandle = (
  fileMap: Map<string, string>,
  workingDirectory: string,
  base: string,
  pathService: Path.Path,
): SandboxHandle => ({
  workingDirectory,
  sandboxFileFor: (fileName) => sandboxFileNameOf(fileMap, fileName),
  originalFileFor: (sandboxFileName) => originalFileNameOf(sandboxFileName, workingDirectory, base, pathService),
})

const announceSandbox = (
  options: StrykerOptions,
  workingDirectory: string,
  backupDirectory: string,
  basePath: string,
  pathService: Path.Path,
): Effect.Effect<void> =>
  Match.value(options.inPlace).pipe(
    Match.when(true, () =>
      Effect.logInfo(
        `In place mode is enabled, Stryker will be overriding YOUR files. Find your backup at: ${
          pathService.relative(basePath, backupDirectory)
        }`,
      )),
    Match.orElse(() => Effect.logDebug(`Creating a sandbox for files in ${workingDirectory}`)),
  )

const hasBackupToRestore = (options: StrykerOptions, backupDirectory: string): boolean =>
  Match.value(options.inPlace).pipe(
    Match.when(true, () => backupDirectory !== ''),
    Match.orElse(() => false),
  )

const restoreOriginalFiles = (
  workingDirectory: string,
  backupDirectory: string,
  basePath: string,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path | Scope.Scope> =>
  Effect.addFinalizer(() =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const p = yield* Path.Path
      if (!(yield* fs.exists(backupDirectory))) {
        return
      }
      yield* Effect.logInfo(`Resetting your original files from ${p.relative(basePath, backupDirectory)}.`)
      yield* moveDirectoryRecursive(backupDirectory, workingDirectory).pipe(Effect.orDie)
    }).pipe(Effect.orDie)
  )

const isNonEmptyString = (value: string | undefined): value is string =>
  Match.value(value).pipe(
    Match.when(Predicate.isString, (text) => text !== ''),
    Match.orElse(() => false),
  )

const runConfiguredBuild = (
  options: StrykerOptions,
  workingDirectory: string,
): Effect.Effect<void, StrykerError, Path.Path | ChildProcessSpawner.ChildProcessSpawner> =>
  Match.value(options.buildCommand).pipe(
    Match.when(
      isNonEmptyString,
      (command) =>
        Effect.logInfo(`Running build command "${command}" in "${workingDirectory}".`).pipe(
          Effect.andThen(() => runBuildCommandIn(command, workingDirectory)),
        ),
    ),
    Match.orElse(() => Effect.void),
  )

const linksNodeModules = (options: StrykerOptions): boolean =>
  Match.value(options.symlinkNodeModules).pipe(
    Match.when(true, () => !options.inPlace),
    Match.orElse(() => false),
  )

const linkNodeModules = (
  nodeModules: string,
  workingDirectory: string,
  basePath: string,
  pathService: Path.Path,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const resolvedTo = pathService.resolve(pathService.join(basePath, nodeModules))
    const resolvedFrom = pathService.join(workingDirectory, nodeModules)
    yield* Effect.logDebug(`Create symlink from ${resolvedTo} to ${resolvedFrom}`)
    yield* symlinkJunction(resolvedTo, resolvedFrom).pipe(
      Effect.catch((_error) =>
        Effect.logWarning(
          `Unexpected error while trying to symlink "${nodeModules}" in sandbox directory.`,
        )
      ),
    )
  })

const linkFoundNodeModules = (
  options: StrykerOptions,
  workingDirectory: string,
  basePath: string,
  pathService: Path.Path,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const nodeModulesList = yield* findNodeModulesList(basePath, options.tempDirName)
    if (nodeModulesList.length === 0) {
      yield* Effect.logDebug(
        `Could not find a node_modules folder to symlink into the sandbox directory. Search "${basePath}" and its parent directories`,
      )
      return
    }
    yield* Effect.forEach(
      nodeModulesList,
      (nodeModules) => linkNodeModules(nodeModules, workingDirectory, basePath, pathService),
      { concurrency: 1, discard: true },
    )
  })

const symlinkNodeModules = (
  options: StrykerOptions,
  workingDirectory: string,
  basePath: string,
  pathService: Path.Path,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    yield* Effect.logDebug('Start symlink node_modules')
    if (linksNodeModules(options)) {
      yield* linkFoundNodeModules(options, workingDirectory, basePath, pathService)
    }
  })

export const makeSandbox = (
  input: MakeSandboxInput,
): Effect.Effect<
  SandboxHandle,
  PlatformError | StrykerError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function*() {
    const { options, project, workingDirectory, backupDirectory, basePath, parsers } = input
    yield* Scope.Scope
    const pathService = yield* Path.Path

    yield* announceSandbox(options, workingDirectory, backupDirectory, basePath, pathService)
    yield* Effect.when(
      restoreOriginalFiles(workingDirectory, backupDirectory, basePath),
      Effect.succeed(hasBackupToRestore(options, backupDirectory)),
    )
    yield* createPreprocessor(options, basePath, parsers)(project).pipe(
      Effect.mapError((cause) => new StrykerError({ message: 'Sandbox preprocessor failed', cause })),
    )
    const entries: Array<readonly [string, string]> = yield* Effect.forEach(
      [...project.files],
      ([original, file]) =>
        Effect.map(
          sandboxFile(original, file, workingDirectory, backupDirectory, basePath, options),
          (target): readonly [string, string] => [original, target],
        ),
      { concurrency: FILE_CONCURRENCY, discard: false },
    )
    const fileMap = toFileMap(entries)

    yield* runConfiguredBuild(options, workingDirectory)
    yield* symlinkNodeModules(options, workingDirectory, basePath, pathService)
    return buildSandboxHandle(fileMap, workingDirectory, basePath, pathService)
  })

export { createPreprocessor }
export type { FilePreprocessor }
