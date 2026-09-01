/**
 * Sandbox — capability that prepares and manages the mutation sandbox.
 *
 * Owns the file-preprocessor family (disabling type checks and rewriting
 * tsconfig references), the scoped temporary directory, and the sandbox
 * orchestration that writes project files into place, runs the optional
 * build command, and symlinks `node_modules` into the sandbox.
 *
 * The sandbox itself is a single `Cell` sandwich: read the input, decode it
 * into a command, decide the file plan, and write the tree — the write
 * returns the sandbox handle.
 */

import { parse } from '@std/jsonc'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { disableTypeChecks } from '@systemfsoftware/stryker-js-instrumenter'
import { errorToString, normalizeFileName } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { Schema as S } from 'effect'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'

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
import { SandboxCommand, sandboxWorkflow } from './Sandbox.workflow.js'
import { StrykerError } from './stryker-error.schema.js'

// ── Public handles ──────────────────────────────────────────────────────────

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
}

// ── File preprocessor family (one family serving one capability) ────────────

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
  (options: StrykerOptions, impl: typeof disableTypeChecks): FilePreprocessor => (project) => {
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
            try: () => impl(instrumenterFile).then((r) => r.content),
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
      for (const updated of updates) {
        if (updated !== undefined) {
          const key = updated.name
          MutableHashMap.set(project.files, key, updated)
          if (Option.isSome(MutableHashMap.get(project.filesToMutate, key))) {
            MutableHashMap.set(project.filesToMutate, key, updated)
          }
        }
      }
    })
  }

/**
 * Parses a JSONC string into a typed tsconfig.
 */
export function parseTsConfig(
  fileName: string,
  jsonText: string,
): Result.Result<TSConfig, TsConfigParseError> {
  let parsed: unknown
  try {
    parsed = parse(jsonText.replace(/^\uFEFF/, ''))
  } catch (error) {
    return Result.fail(
      new TsConfigParseError({
        file: fileName,
        reason: errorToString(error),
        exitClass: 'ConfigError',
      }),
    )
  }
  if (S.is(TsConfigSchema)(parsed)) {
    return Result.succeed(parsed)
  }
  return Result.fail(
    new TsConfigParseError({
      file: fileName,
      reason: `parsed to ${JSON.stringify(parsed)}, which does not match the tsconfig shape this package consumes`,
      exitClass: 'ConfigError',
    }),
  )
}

const makeTSConfigPreprocessor = (options: StrykerOptions, basePath: string): FilePreprocessor => (project) => {
  if (options.inPlace) {
    return Effect.void
  }
  const touched = new Set<string>()

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

  const rewriteFileArrayProperty = (
    config: TSConfig,
    tsconfigFileName: string,
    prop: 'exclude' | 'files' | 'include',
    pathService: Path.Path,
  ): void => {
    const value = config[prop]
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const entry = value[i]
        if (typeof entry === 'string') {
          const rewritten = tryRewriteReference(entry, tsconfigFileName, pathService)
          if (rewritten !== false) {
            value[i] = rewritten
          }
        }
      }
    }
  }

  const rewriteTSConfigFile = (
    tsconfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> => {
    if (touched.has(tsconfigFileName)) {
      return Effect.void
    }
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

  const rewriteExtends = (
    config: TSConfig,
    tsconfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> => {
    const extend = config.extends
    if (typeof extend === 'string') {
      return Effect.flatMap(rewriteExtendsEntry(config, extend, tsconfigFileName, pathService), (rewritten) => {
        config.extends = rewritten
        return Effect.void
      })
    }
    if (S.is(ExtendsArraySchema)(extend)) {
      return Effect.forEach(extend, (entry) => rewriteExtendsEntry(config, entry, tsconfigFileName, pathService))
        .pipe(
          Effect.flatMap((rewritten) => {
            config.extends = rewritten
            return Effect.void
          }),
        )
    }
    return Effect.void
  }

  const rewriteProjectReferences = (
    config: TSConfig,
    originTSConfigFileName: string,
    pathService: Path.Path,
  ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> => {
    const references = config.references
    if (!references) {
      return Effect.void
    }
    return Effect.forEach(references, (ref) => {
      const rewritten = tryRewriteReference(ref.path, originTSConfigFileName, pathService)
      if (rewritten !== false) {
        ref.path = rewritten
        return Effect.void
      }
      let refPath = `${ref.path}/tsconfig.json`
      if (ref.path.endsWith('.json')) {
        refPath = ref.path
      }
      const refFileName = pathService.resolve(pathService.dirname(originTSConfigFileName), refPath)
      return rewriteTSConfigFile(refFileName, pathService)
    }).pipe(Effect.asVoid)
  }

  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    return yield* rewriteTSConfigFile(pathService.resolve(options.tsconfigFile), pathService)
  })
}

const createPreprocessor = (
  options: StrykerOptions,
  basePath: string,
): FilePreprocessor =>
  combinePreprocessors([
    makeDisableTypeChecksPreprocessor(options, disableTypeChecks),
    makeTSConfigPreprocessor(options, basePath),
  ])

// ── Temporary directory ────────────────────────────────────────────────────

/**
 * Scoped temporary directory. Created inside a `Scope`; its finalizer
 * decides from the run's `Exit` whether to keep it.
 */
export interface TemporaryDirectoryShape {
  readonly path: string
}

export class TemporaryDirectory extends Context.Service<TemporaryDirectory, TemporaryDirectoryShape>()(
  '@systemfsoftware/stryker-js-engine/TemporaryDirectory',
) {}

/**
 * Layer that creates the temp directory under `options.tempDirName` and
 * registers a finalizer that reads the `Exit`. The prefix is `backup-`
 * when `inPlace` is enabled and `sandbox-` otherwise.
 */
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
          const shouldRemove = Exit.isSuccess(exit) || options.cleanTempDir === 'always'
          if (!shouldRemove) {
            yield* Effect.logDebug('Not removing the temp dir because an error occurred')
            return
          }
          yield* Effect.logDebug(`Deleting stryker temp directory ${tmp}`)
          yield* fs.remove(tmp, { recursive: true, force: true })
          if (yield* fs.exists(parent)) {
            const siblings = yield* fs.readDirectory(parent)
            if (siblings.length === 0) {
              yield* fs.remove(parent, { recursive: true, force: true })
            }
          }
        }).pipe(Effect.orDie)
      )

      return { path: tmp }
    }),
  )

// ── Sandbox orchestration ──────────────────────────────────────────────────

const toFileMap = (entries: readonly (readonly [string, string])[]): Map<string, string> => new Map(entries)

const binDirectoriesFrom = (from: string, pathService: Path.Path): string[] => {
  const directories: string[] = []
  let current = pathService.resolve(from)
  for (;;) {
    directories.push(pathService.join(current, 'node_modules', '.bin'))
    const parent = pathService.dirname(current)
    if (parent === current) {
      return directories
    }
    current = parent
  }
}

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
    const inheritedPath = process.env['PATH'] ?? ''
    const binDirs = binDirectoriesFrom(workingDirectory, pathService)
    const newPath = [...binDirs, inheritedPath].join(separator)

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

    if (result.exitCode !== 0) {
      return yield* new StrykerError({
        message: `Build command "${command}" failed with exit code ${String(result.exitCode)}.\n${result.stderr}`,
      })
    }
  })

const findNodeModulesList = (
  basePath: string,
  tempDirName: string | undefined,
): Effect.Effect<string[], PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fsService = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    const nodeModulesList: string[] = []
    const queue: string[] = ['.']
    let dir: string | undefined
    while ((dir = queue.pop()) !== undefined) {
      if (pathService.basename(dir) === tempDirName) {
        continue
      }
      if (pathService.basename(dir) === 'node_modules') {
        nodeModulesList.push(dir)
        continue
      }
      const entries = yield* fsService
        .readDirectory(pathService.join(basePath, dir))
        .pipe(Effect.orElseSucceed((): readonly string[] => []))
      for (const entry of entries) {
        const full = pathService.join(dir, entry)
        const statType = yield* fsService.stat(pathService.join(basePath, full)).pipe(
          Effect.map((info) => info.type),
          Effect.orElseSucceed((): string => 'Unknown'),
        )
        if (statType === 'Directory') {
          queue.push(full)
        }
      }
    }
    return nodeModulesList
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

/**
 * Move the contents of `from` into `to`, merging rather than replacing, which is
 * what restoring a backup over a working tree needs.
 */
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
    for (const file of yield* fs.readDirectory(from)) {
      const fromFileName = pathService.join(from, file)
      const toFileName = pathService.join(to, file)
      const stat = yield* fs.stat(fromFileName)
      if (stat.type === 'Directory') {
        yield* moveDirectoryRecursive(fromFileName, toFileName)
      } else {
        yield* fs.rename(fromFileName, toFileName).pipe(
          Effect.catch(() => fs.copyFile(fromFileName, toFileName).pipe(Effect.andThen(fs.remove(fromFileName)))),
        )
      }
    }
    yield* fs.remove(from, { recursive: true, force: true })
  })

const sandboxFile = (
  name: string,
  file: ProjectFile,
  workingDirectory: string,
  backupDirectory: string,
  basePath: string,
  options: StrykerOptions,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> => {
  if (options.inPlace) {
    if (!hasChanges(file)) {
      return Effect.succeed(name)
    }
    return Effect.flatMap(
      backupTo(file, backupDirectory, basePath),
      (_backupFileName) =>
        Effect.flatMap(
          Effect.logDebug('Stored backup file'),
          () => Effect.as(writeInPlace(file), name),
        ),
    )
  }
  return writeToSandbox(file, workingDirectory, basePath)
}

export const makeSandbox = (
  input: MakeSandboxInput,
): Effect.Effect<
  SandboxHandle,
  PlatformError | StrykerError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function*() {
    const buildHandle = (
      fileMap: Map<string, string>,
      wd: string,
      base: string,
      pathService: Path.Path,
    ): SandboxHandle => {
      const sandboxFileFor = (fileName: string): string => {
        const sandboxFileName = fileMap.get(fileName)
        if (sandboxFileName === undefined) {
          throw new StrykerError({ message: `Cannot find sandbox file for ${fileName}` })
        }
        return sandboxFileName
      }
      const originalFileFor = (sandboxFileName: string): string => {
        const resolvedSandbox = pathService.resolve(sandboxFileName)
        const resolvedWorking = pathService.resolve(wd)
        if (resolvedSandbox.startsWith(resolvedWorking)) {
          const suffix = resolvedSandbox.slice(resolvedWorking.length)
          let trimmed: string
          if (suffix.startsWith('/')) {
            trimmed = suffix.slice(1)
          } else {
            trimmed = suffix
          }
          if (trimmed.length === 0) {
            return base
          }
          return pathService.join(base, trimmed)
        }
        return resolvedSandbox.replace(resolvedWorking, base)
      }
      return { workingDirectory: wd, sandboxFileFor, originalFileFor }
    }

    const sandboxCell = Cell.layer({
      read: (command: MakeSandboxInput) =>
        // raw: MakeSandboxInput from MakeSandboxInput
        Effect.gen(function*() {
          yield* Scope.Scope
          const pathService = yield* Path.Path
          const { options, workingDirectory, backupDirectory, basePath } = command

          if (options.inPlace) {
            yield* Effect.logInfo(
              `In place mode is enabled, Stryker will be overriding YOUR files. Find your backup at: ${
                pathService.relative(basePath, backupDirectory)
              }`,
            )
          } else {
            yield* Effect.logDebug(`Creating a sandbox for files in ${workingDirectory}`)
          }

          if (options.inPlace && backupDirectory) {
            const capturedBackup = backupDirectory
            const capturedWorking = workingDirectory
            const capturedBase = basePath
            yield* Effect.addFinalizer(() =>
              Effect.gen(function*() {
                const fs = yield* FileSystem.FileSystem
                const p = yield* Path.Path
                if (!(yield* fs.exists(capturedBackup))) {
                  return
                }
                yield* Effect.logInfo(
                  `Resetting your original files from ${p.relative(capturedBase, capturedBackup)}.`,
                )
                yield* moveDirectoryRecursive(capturedBackup, capturedWorking).pipe(
                  Effect.orDie,
                )
              }).pipe(Effect.orDie)
            )
          }

          return command
        }),
      decode: (raw: MakeSandboxInput): Result.Result<SandboxCommand, StrykerError> =>
        Result.succeed(
          new SandboxCommand({
            fileEntries: [...raw.project.files].map(([name, file]) => ({
              name,
              hasChanges: hasChanges(file),
            })),
            basePath: raw.basePath,
            workingDirectory: raw.workingDirectory,
            backupDirectory: raw.backupDirectory,
            inPlace: raw.options.inPlace,
          }),
        ),
      decide: sandboxWorkflow,
      encode: (outcome) => outcome,
      write: (outcome, raw) =>
        Effect.gen(function*() {
          if (Result.isFailure(outcome)) {
            return yield* new StrykerError({ message: outcome.failure.message })
          }
          const decision = outcome.success
          const { options, project, workingDirectory, backupDirectory, basePath } = raw
          const pathService = yield* Path.Path
          yield* createPreprocessor(options, basePath)(project).pipe(
            Effect.mapError((cause) => new StrykerError({ message: 'Sandbox preprocessor failed', cause })),
          )
          const entries: Array<readonly [string, string]> = yield* Effect.forEach(
            decision.entries,
            (
              { original }: { readonly original: string; readonly target: string; readonly needsBackup: boolean },
            ): Effect.Effect<
              readonly [string, string],
              PlatformError | StrykerError,
              FileSystem.FileSystem | Path.Path
            > => {
              const fileOpt = MutableHashMap.get(project.files, original)
              if (Option.isNone(fileOpt)) {
                return Effect.fail(
                  new StrykerError({ message: `Cannot find project file for ${original}` }),
                )
              }
              const file = fileOpt.value
              return Effect.map(
                sandboxFile(original, file, workingDirectory, backupDirectory, basePath, options),
                (target): readonly [string, string] => [original, target],
              )
            },
            { concurrency: FILE_CONCURRENCY, discard: false },
          )

          const fileMap = toFileMap(entries)

          if (options.buildCommand !== undefined && options.buildCommand !== '') {
            const command = options.buildCommand
            const dir = workingDirectory
            yield* Effect.logInfo(`Running build command "${command}" in "${dir}".`).pipe(
              Effect.andThen(() => runBuildCommandIn(command, dir)),
            )
          }

          const shouldSymlink = options.symlinkNodeModules && !options.inPlace
          if (shouldSymlink) {
            const tempDirName = options.tempDirName
            yield* Effect.logDebug('Start symlink node_modules')
            const nodeModulesList = yield* findNodeModulesList(basePath, tempDirName)
            if (nodeModulesList.length === 0) {
              yield* Effect.logDebug(
                `Could not find a node_modules folder to symlink into the sandbox directory. Search "${basePath}" and its parent directories`,
              )
            } else {
              for (const nodeModules of nodeModulesList) {
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
              }
            }
          } else {
            yield* Effect.logDebug('Start symlink node_modules')
          }
          return buildHandle(fileMap, workingDirectory, basePath, pathService)
        }),
    })

    return yield* Cell.run(sandboxCell, input)
  })

// Re-export preprocessor factory for callers that previously imported via sandbox/index
export { createPreprocessor }
export type { FilePreprocessor }
