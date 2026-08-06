import * as Command from '@effect/platform/Command'
import * as CommandExecutor from '@effect/platform/CommandExecutor'
import * as FileSystem from '@effect/platform/FileSystem'
import * as Path from '@effect/platform/Path'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Stream from 'effect/Stream'
import { OxlintConfigBasename } from '../edit-command.schema.js'
import { LintGuardAdapter, OxlintBinaryNotExecutable, SpawnFailure, TRUNCATION_MARKER } from './lint-guard.executor.js'
import type { GatheredFacts, ProcessResult } from './lint-guard.executor.js'

const CONFIG_BASENAMES: readonly string[] = OxlintConfigBasename.literals

const LOCKFILE_BASENAMES: readonly string[] = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
]

// The walk for configs and binaries must never escape the project: on a shared
// host, a binary planted in an ancestor directory (e.g. /tmp/node_modules/
// .bin/oxlint) would otherwise be selected and run against the agent's files.
const PROJECT_ROOT_ENV = 'CLAUDE_PROJECT_DIR'

// 64 KiB per stream bounds both the buffered memory and the text that reaches
// the block message (which carries a single stream).
const OUTPUT_CAP_BYTES = 64 * 1024

const walkUp = (path: Path.Path, startDir: string): readonly string[] => {
  const dirs: string[] = []
  let dir = startDir
  let parent = path.dirname(dir)
  while (parent !== dir) {
    dirs.push(dir)
    dir = parent
    parent = path.dirname(dir)
  }
  dirs.push(dir)
  return dirs
}

const withinRoot = (root: string, dir: string, sep: string): boolean => dir === root || dir.startsWith(root + sep)

// The prefix of walkUp(startDir) that stays inside root, root included.
const dirsUpToRoot = (path: Path.Path, startDir: string, root: string): readonly string[] => {
  const walked = walkUp(path, startDir)
  const firstOutside = walked.findIndex((dir) => !withinRoot(root, dir, path.sep))
  return firstOutside === -1 ? walked : walked.slice(0, firstOutside)
}

const findProjectRoot = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
): Effect.Effect<string, never> =>
  Effect.gen(function*() {
    const fromEnv = process.env[PROJECT_ROOT_ENV]
    if (fromEnv !== undefined && fromEnv.trim() !== '') {
      return path.resolve(fromEnv)
    }
    // Nearest enclosing git/worktree root — a .git entry may be a directory or,
    // in a worktree, a file pointing at the real git dir.
    for (const dir of walkUp(path, cwd)) {
      const hasGitMarker = yield* Effect.catchAll(fs.exists(path.join(dir, '.git')), () => Effect.succeed(false))
      if (hasGitMarker) {
        return dir
      }
    }
    return cwd
  })

const findFirstExisting = (
  fs: FileSystem.FileSystem,
  candidates: readonly string[],
): Effect.Effect<Option.Option<string>, never> =>
  Effect.reduce(candidates, Option.none<string>(), (acc, candidate) =>
    Option.isSome(acc)
      ? Effect.succeed(acc)
      : Effect.map(
        Effect.catchAll(fs.exists(candidate), () => Effect.succeed(false)),
        (exists) => (exists ? Option.some(candidate) : Option.none()),
      ))

// The first existing candidate is the local binary, whatever state it is in:
// a candidate that exists but can never run (a directory) must be reported as
// broken rather than silently skipped so the walk cannot climb to an ancestor.
const findOxlintBinary = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  candidates: readonly string[],
): Effect.Effect<Option.Option<string>, OxlintBinaryNotExecutable> =>
  Effect.gen(function*() {
    for (const candidate of candidates) {
      const exists = yield* Effect.catchAll(fs.exists(candidate), () => Effect.succeed(false))
      if (!exists) {
        continue
      }
      const info = yield* Effect.catchAll(
        Effect.map(fs.stat(candidate), (info) => Option.some(info)),
        () => Effect.succeed(Option.none()),
      )
      if (Option.isSome(info) && info.value.type === 'Directory') {
        yield* Effect.fail(new OxlintBinaryNotExecutable({ path: candidate }))
      }
      return Option.some(candidate)
    }
    return Option.none()
  })

const readFirstLine = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<Option.Option<string>, never> =>
  Effect.catchAll(
    Effect.map(
      Stream.runFold(Stream.take(fs.stream(filePath), 1), '', (_, chunk) => new TextDecoder().decode(chunk)),
      (firstChunk) => {
        const firstLine = firstChunk.split('\n', 1)[0] ?? ''
        return firstLine === '' ? Option.none() : Option.some(firstLine)
      },
    ),
    () => Effect.succeed(Option.none()),
  )

const binaryCandidates = (path: Path.Path, dir: string): readonly string[] => {
  const bin = path.join(dir, 'node_modules', '.bin')
  return path.sep === '\\'
    ? [path.join(bin, 'oxlint.cmd'), path.join(bin, 'oxlint')]
    : [path.join(bin, 'oxlint')]
}

interface Drained {
  readonly bytes: Uint8Array
  readonly truncated: boolean
}

// Keeps draining (so the child never blocks on a full pipe) but accumulates at
// most OUTPUT_CAP_BYTES, appending the marker when bytes were cut.
const drainToString = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<string, unknown> =>
  Stream.runFold(
    stream,
    { bytes: new Uint8Array(), truncated: false },
    (acc, chunk): Drained => {
      if (acc.truncated) {
        return acc
      }
      const room = OUTPUT_CAP_BYTES - acc.bytes.length
      if (room <= 0) {
        return { bytes: acc.bytes, truncated: true }
      }
      const take = Math.min(room, chunk.length)
      const merged = new Uint8Array(acc.bytes.length + take)
      merged.set(acc.bytes)
      merged.set(chunk.subarray(0, take), acc.bytes.length)
      return { bytes: merged, truncated: take < chunk.length }
    },
  ).pipe(Effect.map(({ bytes, truncated }) => {
    const text = new TextDecoder().decode(bytes)
    return truncated ? `${text}${TRUNCATION_MARKER}` : text
  }))

const reasonOf = (error: unknown): SpawnFailure['reason'] => {
  if (typeof error !== 'object' || error === null) {
    return 'unknown'
  }
  const systemReason = 'reason' in error ? Reflect.get(error, 'reason') : undefined
  if (systemReason === 'NotFound') {
    return 'not-found'
  }
  if (systemReason === 'PermissionDenied' || systemReason === 'BadResource') {
    return 'not-executable'
  }
  const code = 'code' in error ? Reflect.get(error, 'code') : undefined
  if (code === 'ENOENT') {
    return 'not-found'
  }
  if (code === 'EACCES' || code === 'EPERM' || code === 'EISDIR') {
    return 'not-executable'
  }
  return 'unknown'
}

const toSpawnFailure = (program: string, error: unknown): SpawnFailure => {
  const message = error instanceof Error ? error.message : 'unknown error'
  return new SpawnFailure({ program, reason: reasonOf(error), message })
}

const programName = (command: Command.Command): string => Command.flatten(command)[0].command

const makeLintGuardAdapter = (options: {
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly executor: CommandExecutor.CommandExecutor
}): LintGuardAdapter => {
  const { fs, path, executor } = options

  const gather = (filePath: string, cwd: string): Effect.Effect<GatheredFacts, OxlintBinaryNotExecutable> =>
    Effect.gen(function*() {
      const resolved = path.resolve(cwd, filePath)
      const root = yield* findProjectRoot(fs, path, cwd)
      const dirs = dirsUpToRoot(path, path.dirname(resolved), root)
      const exists = yield* Effect.catchAll(fs.exists(resolved), () => Effect.succeed(false))
      const firstLine = exists ? yield* readFirstLine(fs, resolved) : Option.none()
      const configPath = yield* findFirstExisting(
        fs,
        dirs.flatMap((dir) => CONFIG_BASENAMES.map((name) => path.join(dir, name))),
      )
      const oxlintBinary = yield* findOxlintBinary(fs, path, dirs.flatMap((dir) => binaryCandidates(path, dir)))
      const lockfile = yield* Effect.map(
        findFirstExisting(
          fs,
          dirs.flatMap((dir) => LOCKFILE_BASENAMES.map((name) => path.join(dir, name))),
        ),
        Option.map((found) => path.basename(found)),
      )
      return { resolvedPath: resolved, exists, firstLine, configPath, oxlintBinary, lockfile }
    })

  const run = (command: Command.Command): Effect.Effect<ProcessResult, SpawnFailure> =>
    Effect.catchAll(
      Effect.scoped(
        Effect.gen(function*() {
          const process = yield* executor.start(command)
          const [stdout, stderr, exitCode] = yield* Effect.all(
            [drainToString(process.stdout), drainToString(process.stderr), process.exitCode],
            { concurrency: 'unbounded' },
          )
          return { stdout, stderr, exitCode: Number(exitCode) }
        }),
      ),
      (error) => Effect.fail(toSpawnFailure(programName(command), error)),
    )

  return { gather, run }
}

export const layer: Layer.Layer<
  LintGuardAdapter,
  never,
  FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor
> = Layer.effect(
  LintGuardAdapter,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const executor = yield* CommandExecutor.CommandExecutor
    return makeLintGuardAdapter({ fs, path, executor })
  }),
)
