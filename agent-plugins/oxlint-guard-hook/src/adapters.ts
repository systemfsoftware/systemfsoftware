import { Duration, Effect, Match, Option, Schema as S, Stream } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { Path } from 'effect/Path'
import { make as makeProcessCommand } from 'effect/unstable/process/ChildProcess'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { CONFIG_BASENAMES, STDIN_CAP_BYTES } from './constants.ts'
import {
  type FactFields,
  type GuardAdapters,
  type GuardInputError,
  type GuardRaw,
  GuardReadError,
  GuardWire,
  type HookResult,
  type RunOutcome,
  StdinOverCapError,
  type StdinPayload,
  WirePayload,
  WireUnreadableError,
} from './flow.schema.ts'
import { PASS } from './verdict.ts'

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

/**
 * The shell's pure read transform: concatenated stdin bytes plus the cap verdict as data.
 * The over-cap decision itself belongs to the cell's read phase.
 */
export const stdinPayload = (chunks: Iterable<Uint8Array>): StdinPayload => {
  const list = Array.from(chunks)
  const bytes = list.reduce((total, chunk) => total + chunk.byteLength, 0)
  return { text: decodeBytes(list), overCap: bytes > STDIN_CAP_BYTES }
}

/**
 * The boundary's response to an unreadable input: the hook contract keeps over-cap and
 * malformed payloads a silent skip, while a gather failure surfaces as the exit-1 hint.
 */
export const inputErrorResponse = (error: GuardInputError): HookResult =>
  Match.value(error).pipe(
    Match.tag('StdinOverCapError', () => PASS),
    Match.tag('WireUnreadableError', () => PASS),
    Match.tag(
      'GuardReadError',
      (): HookResult => ({
        exitCode: 1,
        stderr: 'oxlint-guard-hook: could not read the file to lint - check the path exists and retry.',
      }),
    ),
    Match.exhaustive,
  )

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

/**
 * The fs half of the read: everything here is a genuine gather failure, so the whole
 * block is wrapped into GuardReadError. Transport failures never enter this effect.
 */
const gatherFileFacts = (
  fs: FileSystem,
  path: Path,
  cwd: string,
  rootOverride: string | undefined,
  filePath: string,
): Effect.Effect<FactFields, GuardReadError> =>
  Effect.gen(function*() {
    const resolvedPath = path.resolve(cwd, filePath)
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
    return { exists, denoShebang, extension, configPath } satisfies FactFields
  }).pipe(
    Effect.catchEager((error) => Effect.fail(new GuardReadError({ message: messageOf(error) }))),
  )

/**
 * The cell's read phase: the raw stdin text is validated as transport here (an over-cap
 * payload or an unreadable one is a typed read failure, not a domain state), and the file
 * facts the decision needs are gathered in the same impure step.
 */
const gatherStdin = (
  fs: FileSystem,
  path: Path,
  cwd: string,
  rootOverride: string | undefined,
) =>
(stdin: StdinPayload): Effect.Effect<GuardRaw, GuardInputError> =>
  Effect.gen(function*() {
    if (stdin.overCap) {
      return yield* Effect.fail(new StdinOverCapError())
    }
    const payload = yield* Effect.option(
      S.decodeUnknownEffect(S.fromJsonString(WirePayload))(stdin.text),
    )
    if (Option.isNone(payload)) {
      return yield* Effect.fail(new WireUnreadableError())
    }
    const filePath = payload.value.tool_input.file_path
    const facts = yield* gatherFileFacts(fs, path, cwd, rootOverride, filePath)
    return { wire: new GuardWire({ toolName: payload.value.tool_name, filePath }), facts }
  })

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
    // Concurrent drain: tuple Effect.all is sequential by default, and a
    // sequential drain deadlocks when the child fills the stderr pipe while
    // stdout is still open — the timeout would then misclassify a healthy
    // (or failing) run as `timeout` and the guard would silently pass.
    const [stdoutChunk, stderrChunk, exitCode] = yield* Effect.all(
      [Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr), handle.exitCode],
      { concurrency: 'unbounded' },
    )
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
  gather: gatherStdin(deps.fs, deps.path, deps.cwd, deps.rootOverride),
  runner: {
    run: (program, args, cwd, timeoutMs) => runCommand(deps.spawner, program, args, cwd, timeoutMs),
  },
  dirname: (target) => deps.path.dirname(target),
})
