import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'

import { type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'

import { backupTo, hasChanges, writeInPlace, writeToSandbox } from '../project/project-file.js'
import type { ProjectFile } from '../project/project-file.js'
import type { Project } from '../project/project.js'
import { StrykerError } from '../stryker-error.schema.js'

export interface SandboxHandle {
  readonly workingDirectory: string
  readonly sandboxFileFor: (fileName: string) => string
  readonly originalFileFor: (sandboxFileName: string) => string
}

export interface MakeSandboxInput {
  readonly options: StrykerOptions
  readonly logger: Logger
  readonly project: Project
  readonly workingDirectory: string
  readonly backupDirectory: string
  readonly basePath: string
}

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
    const separator = process.platform === 'win32' ? ';' : ':'
    const inheritedPath = process.env['PATH'] ?? ''
    const binDirs = binDirectoriesFrom(workingDirectory, pathService)
    const newPath = [...binDirs, inheritedPath].join(separator)

    // `buildCommand` is a command line from a person's config ("npm run build"),
    // so it runs through a shell for the same reason the command test runner
    // does: spawned directly, the whole string becomes the program name.
    //
    // `extendEnv` matters as much as the PATH built above: without it the child
    // receives that PATH and nothing else, losing HOME, NODE_OPTIONS and every
    // other variable a build reads.
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
    while ((dir = queue.pop())) {
      if (pathService.basename(dir) === tempDirName) {
        continue
      }
      if (pathService.basename(dir) === 'node_modules') {
        nodeModulesList.push(dir)
        continue
      }
      // This walks a tree nobody here owns, where an entry that cannot be read -
      // a directory without permission, a dangling symlink, a socket - is a fact
      // about the project rather than a fault. Such an entry is simply not a
      // `node_modules` to symlink, so it is skipped by design; the run does not
      // depend on having seen it.
      const entries = yield* fsService
        .readDirectory(pathService.join(basePath, dir))
        .pipe(Effect.orElseSucceed(() => [] as readonly string[]))
      for (const entry of entries) {
        const full = pathService.join(dir, entry)
        const statType = yield* fsService.stat(pathService.join(basePath, full)).pipe(
          Effect.map((info) => info.type),
          Effect.orElseSucceed(() => 'Unknown' as const),
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
 *
 * Nothing here is swallowed. Every failure this can hit - an unreadable
 * directory, a stat that faults, a file that will not move - means the caller's
 * files are not all back, and the only caller is the `--inPlace` restore, where
 * that is the user's own source tree.
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
        // `rename` is the move. It fails across devices (EXDEV), and there a
        // copy-then-delete is the only move available - as bytes, never through
        // a string, because a string round-trip corrupts every file in the
        // project that is not text.
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
  logger: Logger,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> => {
  if (options.inPlace) {
    if (!hasChanges(file)) {
      return Effect.succeed(name)
    }
    return Effect.flatMap(
      backupTo(file, backupDirectory, basePath),
      (backupFileName) =>
        Effect.flatMap(
          Effect.sync(() => logger.debug('Stored backup file at %s', backupFileName)),
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
    const pathService = yield* Path.Path
    const { options, logger, project, workingDirectory, backupDirectory, basePath } = input

    if (options.inPlace) {
      logger.info(
        'In place mode is enabled, Stryker will be overriding YOUR files. Find your backup at: %s',
        pathService.relative(basePath, backupDirectory),
      )
    } else {
      logger.debug('Creating a sandbox for files in %s', workingDirectory)
    }

    if (options.inPlace && backupDirectory) {
      const capturedBackup = backupDirectory
      const capturedWorking = workingDirectory
      const capturedBase = basePath
      const capturedLog = logger
      yield* Effect.addFinalizer(() =>
        Effect.gen(function*() {
          const fs = yield* FileSystem.FileSystem
          const p = yield* Path.Path
          if (!(yield* fs.exists(capturedBackup))) {
            return
          }
          capturedLog.info(`Resetting your original files from ${p.relative(capturedBase, capturedBackup)}.`)
          yield* moveDirectoryRecursive(capturedBackup, capturedWorking)
          // A failed restore is not a warning. This runs under `--inPlace`, so
          // the files that did not come back are the user's own sources, still
          // carrying this run's mutations. Warning and exiting 0 tells them the
          // run was fine while their working tree is wrong, so the failure has
          // to end the program - the backup is still on disk, named in the line
          // above, and that is what makes it recoverable by hand.
        }).pipe(Effect.orDie)
      )
    }

    const entries: Array<readonly [string, string]> = yield* Effect.forEach(
      [...project.files.entries()],
      ([name, file]) =>
        Effect.map(
          sandboxFile(name, file, workingDirectory, backupDirectory, basePath, options, logger),
          (target) => [name, target] as const,
        ),
      // Each entry writes a distinct target path, so these are independent.
      // `Effect.forEach` is sequential by default; without this the sandbox
      // pays the sum of per-file copy latencies instead of the maximum, which
      // is seconds on a large checkout. Result order is preserved regardless.
      { concurrency: 'unbounded', discard: false },
    )

    const fileMap = toFileMap(entries)

    if (options.buildCommand) {
      const command = options.buildCommand
      const dir = workingDirectory
      yield* Effect.flatMap(
        Effect.sync(() => logger.info('Running build command "%s" in "%s".', command, dir)),
        () => runBuildCommandIn(command, dir),
      )
    }

    const shouldSymlink = options.symlinkNodeModules && !options.inPlace
    if (shouldSymlink) {
      const tempDirName = options.tempDirName
      logger.debug('Start symlink node_modules')
      const nodeModulesList = yield* findNodeModulesList(basePath, tempDirName)
      if (nodeModulesList.length === 0) {
        logger.debug(
          `Could not find a node_modules folder to symlink into the sandbox directory. Search "${basePath}" and its parent directories`,
        )
      } else {
        for (const nodeModules of nodeModulesList) {
          const resolvedTo = pathService.resolve(pathService.join(basePath, nodeModules))
          const resolvedFrom = pathService.join(workingDirectory, nodeModules)
          logger.debug(`Create symlink from ${resolvedTo} to ${resolvedFrom}`)
          yield* symlinkJunction(resolvedTo, resolvedFrom).pipe(
            Effect.catch((error) =>
              Effect.sync(() =>
                logger.warn(`Unexpected error while trying to symlink "${nodeModules}" in sandbox directory.`, error)
              )
            ),
          )
        }
      }
    } else {
      logger.debug('Start symlink node_modules')
    }

    const sandboxFileFor = (fileName: string): string => {
      const sandboxFileName = fileMap.get(fileName)
      if (sandboxFileName === undefined) {
        throw new StrykerError({ message: `Cannot find sandbox file for ${fileName}` })
      }
      return sandboxFileName
    }

    const originalFileFor = (sandboxFileName: string): string => {
      const resolvedSandbox = pathService.resolve(sandboxFileName)
      const resolvedWorking = pathService.resolve(workingDirectory)
      if (resolvedSandbox.startsWith(resolvedWorking)) {
        const suffix = resolvedSandbox.slice(resolvedWorking.length)
        const trimmed = suffix.startsWith('/') ? suffix.slice(1) : suffix
        return trimmed.length === 0 ? basePath : pathService.join(basePath, trimmed)
      }
      return resolvedSandbox.replace(resolvedWorking, basePath)
    }

    return {
      workingDirectory,
      sandboxFileFor,
      originalFileFor,
    } satisfies SandboxHandle
  })
