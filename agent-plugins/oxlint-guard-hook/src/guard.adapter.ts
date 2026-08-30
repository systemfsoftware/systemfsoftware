import { Duration, Effect, Option, Stream } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { Path } from 'effect/Path'
import { make as makeProcessCommand } from 'effect/unstable/process/ChildProcess'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { CONFIG_BASENAMES } from './constants.ts'
import type { RunOutcome } from './flow.schema.ts'
import { type FactFields, type GuardAdapters, type GuardRaw, GuardReadError, type GuardWire } from './guard.workflow.ts'

interface AdapterDeps {
  readonly fs: FileSystem
  readonly path: Path
  readonly spawner: ChildProcessSpawner['Service']
  readonly cwd: string
  readonly rootOverride: string | undefined
}

const DENO_SHEBANG = /^#!.*\bdeno\b/

const messageOf = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return 'unknown gather failure'
}

export const decodeBytes = (chunks: Iterable<Uint8Array>): string => {
  const list = Array.from(chunks)
  let total = 0
  for (const chunk of list) {
    total += chunk.byteLength
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of list) {
    all.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(all)
}

const firstLineOf = (text: string): string => text.split('\n', 1)[0] ?? ''

const withinRoot = (path: Path, root: string, dir: string): boolean => dir === root || dir.startsWith(root + path.sep)

const walkUp = (
  path: Path,
  startDir: string,
  root: string,
): readonly string[] => {
  const dirs: string[] = []
  let dir = startDir
  while (withinRoot(path, root, dir)) {
    dirs.push(dir)
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return dirs
}

const findProjectRoot = (
  fs: FileSystem,
  path: Path,
  cwd: string,
  rootOverride: string | undefined,
) =>
  Effect.gen(function*() {
    if (rootOverride !== undefined && rootOverride.trim() !== '') {
      return path.resolve(cwd, rootOverride)
    }
    let dir = cwd
    while (path.dirname(dir) !== dir) {
      if (yield* fs.exists(path.join(dir, '.git'))) {
        return dir
      }
      dir = path.dirname(dir)
    }
    return cwd
  })

const firstExistingConfig = (
  fs: FileSystem,
  path: Path,
  dirs: readonly string[],
) =>
  Effect.gen(function*() {
    const candidates = dirs.flatMap((dir) => CONFIG_BASENAMES.map((name) => path.join(dir, name)))
    for (const candidate of candidates) {
      if (yield* fs.exists(candidate)) {
        return Option.some(candidate)
      }
    }
    return Option.none()
  })

const gatherFacts =
  (fs: FileSystem, path: Path, cwd: string, rootOverride: string | undefined) =>
  (wire: GuardWire): Effect.Effect<GuardRaw, GuardReadError> =>
    Effect.gen(function*() {
      const resolvedPath = path.resolve(cwd, wire.filePath)
      const extension = path.extname(resolvedPath).slice(1)
      const exists = yield* fs.exists(resolvedPath)
      let firstLine: string | null = null
      if (exists) {
        const bytes = yield* Stream.runCollect(
          fs.stream(resolvedPath, { bytesToRead: 4096 }),
        )
        firstLine = firstLineOf(decodeBytes(bytes))
      }
      const denoShebang = DENO_SHEBANG.test(firstLine ?? '')
      let configPath: string | null = null
      if (exists && !denoShebang) {
        const root = yield* findProjectRoot(fs, path, cwd, rootOverride)
        const found = yield* firstExistingConfig(
          fs,
          path,
          walkUp(path, path.dirname(resolvedPath), root),
        )
        configPath = Option.getOrElse(found, () => null)
      }
      const facts: FactFields = { exists, denoShebang, extension, configPath }
      return { wire, facts }
    }).pipe(
      Effect.catchEager((error) => Effect.fail(new GuardReadError({ message: messageOf(error) }))),
    )

const reasonOf = (
  error: unknown,
): 'not-found' | 'not-executable' | 'unknown' => {
  if (typeof error !== 'object' || error === null) {
    return 'unknown'
  }
  if (!('name' in error)) {
    return 'unknown'
  }
  const name = error.name
  if (name === 'NotFound') {
    return 'not-found'
  }
  if (name === 'PermissionDenied' || name === 'NotCapable') {
    return 'not-executable'
  }
  return 'unknown'
}

const failureOf = (
  error: unknown,
): {
  readonly reason: 'not-found' | 'not-executable' | 'unknown'
  readonly message: string
} => {
  let message = 'unknown error'
  if (error instanceof Error) {
    message = error.message
  }
  return { reason: reasonOf(error), message }
}

const runCommand = (
  spawner: ChildProcessSpawner['Service'],
  program: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Effect.Effect<RunOutcome, never, never> => {
  const command = makeProcessCommand(program, args, { cwd })
  // The Effect.timeout below is the outermost deadline for the spawned linter:
  // its typed TimeoutError is handled here as a `{ _tag: 'timeout' }` outcome
  // the guard acts on (skip with exit 0).
  return Effect.gen(function*() {
    const handle = yield* command
    const [stdoutChunk, stderrChunk, exitCode] = yield* Effect.all([
      Stream.runCollect(handle.stdout),
      Stream.runCollect(handle.stderr),
      handle.exitCode,
    ])
    const outcome: RunOutcome = {
      _tag: 'result',
      result: {
        exitCode: exitCode,
        stdout: decodeBytes(stdoutChunk),
        stderr: decodeBytes(stderrChunk),
      },
    }
    return outcome
  }).pipe(
    Effect.scoped,
    Effect.timeout(Duration.millis(timeoutMs)),
    Effect.catchTag(
      'TimeoutError',
      () => Effect.succeed<RunOutcome>({ _tag: 'timeout' }),
    ),
    Effect.catchEager((error) =>
      Effect.succeed<RunOutcome>({
        _tag: 'spawn-failure',
        failure: failureOf(error),
      })
    ),
    Effect.provideService(ChildProcessSpawner, spawner),
  )
}

export const makeGuardAdapters = (deps: AdapterDeps): GuardAdapters => ({
  gather: gatherFacts(deps.fs, deps.path, deps.cwd, deps.rootOverride),
  runner: {
    run: (program, args, cwd, timeoutMs) => runCommand(deps.spawner, program, args, cwd, timeoutMs),
  },
  dirname: (target) => deps.path.dirname(target),
})
