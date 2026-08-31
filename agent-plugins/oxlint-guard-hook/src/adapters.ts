import { Duration, Effect, Match, Option, Schema as S, Stream } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { Path } from 'effect/Path'
import { make as makeProcessCommand } from 'effect/unstable/process/ChildProcess'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { CONFIG_BASENAMES, STDIN_CAP_BYTES } from './constants.ts'
import {
  EditTarget,
  type FactFields,
  type HookResult,
  type LintAdapters,
  type LintEvent,
  type ParsedEdit,
  ReadError,
  type RunOutcome,
  type UnparsedEdit,
  WirePayload,
} from './flow.schema.ts'

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
 * The shell's pure read transform: concatenated stdin bytes plus the cap verdict
 * as data. The oversized-input decision itself belongs to the workflow's decode
 * phase.
 */
export const unparsedEdit = (chunks: Iterable<Uint8Array>): UnparsedEdit => {
  const list = Array.from(chunks)
  const bytes = list.reduce((total, chunk) => total + chunk.byteLength, 0)
  return { text: decodeBytes(list), overCap: bytes > STDIN_CAP_BYTES }
}

/**
 * The edge's transport table: the lint's answer rendered into the hook contract.
 * A total function — every event has exactly one rendering, decided here and
 * nowhere else.
 */
export const responseOf = (event: LintEvent): HookResult =>
  Match.value(event).pipe(
    Match.tag('Approved', (): HookResult => ({ exitCode: 0, stderr: '' })),
    Match.tag('Skipped', (): HookResult => ({ exitCode: 0, stderr: '' })),
    Match.tag('Blocked', ({ diagnostic }): HookResult => ({ exitCode: 2, stderr: diagnostic })),
    Match.tag('Errored', ({ hint }): HookResult => ({ exitCode: 1, stderr: hint })),
    Match.exhaustive,
  )
/** The host's rendering of a gather fault: the exit-1 hint channel of the hook contract. */
export const readFailureOf = (_error: ReadError): LintEvent => ({
  _tag: 'Errored',
  hint: 'oxlint-guard-hook: could not read the file to lint - check the path exists and retry.',
})

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
 * The file-facts half of the read. Everything here is a genuine gather fault, so
 * the whole block is wrapped into ReadError; transport failures never enter it —
 * they leave the parse as data variants of the parsed sum.
 */
const gatherFacts = (
  fs: FileSystem,
  path: Path,
  cwd: string,
  rootOverride: string | undefined,
  filePath: string,
): Effect.Effect<FactFields, ReadError> =>
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
    Effect.catchEager((error) => Effect.fail(new ReadError({ message: messageOf(error) }))),
  )

/**
 * The cell's read phase: parses the raw event into the parsed sum — an oversized
 * payload or an unparsable one is a data variant the decision will see, not a
 * failure — and gathers the file facts for the lintable case in the same impure
 * step.
 */
const gatherEdit = (
  fs: FileSystem,
  path: Path,
  cwd: string,
  rootOverride: string | undefined,
) =>
(edit: UnparsedEdit): Effect.Effect<ParsedEdit, ReadError> =>
  Effect.gen(function*() {
    if (edit.overCap) {
      return { _tag: 'OversizedEdit' }
    }
    const payload = yield* Effect.option(
      S.decodeUnknownEffect(S.fromJsonString(WirePayload))(edit.text),
    )
    if (Option.isNone(payload)) {
      return { _tag: 'UnreadableEdit' }
    }
    const target = new EditTarget({
      toolName: payload.value.tool_name,
      filePath: payload.value.tool_input.file_path,
    })
    const facts = yield* gatherFacts(fs, path, cwd, rootOverride, target.filePath)
    return { _tag: 'LintableEdit', target, facts }
  })

const runCommand = (
  spawner: ChildProcessSpawner['Service'],
  program: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Effect.Effect<RunOutcome, never, never> => {
  const command = makeProcessCommand(program, args, { cwd })
  // The Effect.timeout below is the outermost deadline for the spawned linter:
  // its typed TimeoutError is handled by the verdict layer as a
  // `{ _tag: 'timeout' }` outcome the guard acts on (skip with exit 0).
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

export const makeAdapters = (deps: AdapterDeps): LintAdapters => ({
  gather: gatherEdit(deps.fs, deps.path, deps.cwd, deps.rootOverride),
  runner: {
    run: (program, args, cwd, timeoutMs) => runCommand(deps.spawner, program, args, cwd, timeoutMs),
  },
  dirname: (target) => deps.path.dirname(target),
})
