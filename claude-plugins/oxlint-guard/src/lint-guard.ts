import { basename, dirname, extname, join, resolve, SEPARATOR } from '@std/path'
import { classifyLintResult, type LintViolation, type ProcessResult } from './lint-outcome.ts'
import {
  decideLintPlan,
  invocationFor,
  type LintFailure,
  type LintPlan,
  LOCKFILE_BASENAMES,
  type RunOxlint,
} from './lint-plan.ts'
import { decodeEditCommand, HOOK_STDIN_CAP_BYTES, OXLINT_CONFIG_BASENAMES } from './schemas.ts'

export interface HookResult {
  readonly exitCode: number
  readonly stderr: string
}

export interface CommandSpec {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly signal: AbortSignal
}

export interface LintGuardDeps {
  readonly readTextFile: (path: string) => Promise<string>
  readonly exists: (path: string) => Promise<boolean>
  readonly stat: (path: string) => Promise<{ readonly isDirectory: boolean }>
  readonly runCommand: (spec: CommandSpec) => Promise<ProcessResult>
}

export interface LintGuardOptions {
  readonly commandTimeoutMs?: number
}

// Per-command budget for one linter invocation. Worst case inside the 120s
// hook cap: oxlint type-aware (30s) + its retry (30s), or deno check + lint
// (30s each), plus stdin and file gathering — comfortably under the cap while
// a cold type-aware backend still gets room on a large file.
export const LINT_COMMAND_TIMEOUT_MS = 30_000

// Appended when a drained stream exceeded its byte budget, so the reader of a
// block message knows the output was cut.
export const TRUNCATION_MARKER = '\n[output truncated at 65536 bytes; run the linter directly for full output]'

// The nearest oxlint candidate exists but can never run (it is a directory).
export class OxlintBinaryNotExecutable extends Error {
  readonly path: string
  constructor(args: { readonly path: string }) {
    super(`oxlint binary found at ${args.path} but is not executable`)
    this.name = 'OxlintBinaryNotExecutable'
    this.path = args.path
  }
}

const ACCEPTED_CONFIG_NAMES =
  'oxlint.config.ts, oxlint.config.js, oxlint.config.mjs, oxlint.config.cjs, .oxlintrc.json, or oxlint.json'

// The walk for configs and binaries must never escape the project: on a shared
// host, a binary planted in an ancestor directory (e.g. /tmp/node_modules/
// .bin/oxlint) would otherwise be selected and run against the agent's files.
const PROJECT_ROOT_ENV = 'CLAUDE_PROJECT_DIR'

// 64 KiB per stream bounds both the buffered memory and the text that reaches
// the block message (which carries a single stream).
const OUTPUT_CAP_BYTES = 64 * 1024

// Minimal environment for the linter subprocesses. Forwarding the agent's whole
// environment would hand a binary we do not control — an ancestor-planted
// oxlint, or deno resolved from PATH — every credential the agent holds.
const ALLOWLISTED_ENV_VARS: readonly string[] = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'SystemRoot',
  'COMSPEC',
  'PATHEXT',
]

const minimalEnv = (): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const key of ALLOWLISTED_ENV_VARS) {
    const value = Deno.env.get(key)
    if (value !== undefined) {
      env[key] = value
    }
  }
  return env
}

const describeLintFailure = (failure: LintFailure): string => {
  if (failure._tag === 'NoOxlintConfig') {
    return (
      'oxlint-guard: no oxlint config found in any directory up from the edited file.\n' +
      `Add one of ${ACCEPTED_CONFIG_NAMES} at the project root, and install oxlint locally: ${failure.installHint}`
    )
  }
  return (
    'oxlint-guard: no local oxlint binary (node_modules/.bin/oxlint) found in any directory up from the edited file.\n' +
    `Install oxlint locally: ${failure.installHint}\n` +
    `Make sure an oxlint config (${ACCEPTED_CONFIG_NAMES}) exists at the project root.`
  )
}

const FIX_ROOT_CAUSE = [
  'Fix the root cause of each violation — do not suppress the rule with an eslint-disable comment,',
  'and do not weaken the oxlint config to make the check pass.',
].join('\n')

const TYPE_AWARE_UNAVAILABLE = [
  'the type-aware backend (oxlint-tsgolint) was unavailable, so these findings come from',
  'the lint pass without type information.',
].join('\n')

const describeLintViolation = (violation: LintViolation, options: { readonly typeAware: boolean }): string =>
  `oxlint-guard: lint violations found.\n${
    options.typeAware ? '' : TYPE_AWARE_UNAVAILABLE + '\n'
  }${FIX_ROOT_CAUSE}\n\n${violation.output}`

const stderrOrStdout = (result: ProcessResult): string => (result.stderr !== '' ? result.stderr : result.stdout)

const allow = (): HookResult => ({ exitCode: 0, stderr: '' })

const block = (stderr: string): HookResult => ({ exitCode: 2, stderr })

interface SpawnFailure {
  readonly reason: 'not-found' | 'not-executable' | 'unknown'
  readonly message: string
}

const reasonOf = (error: unknown): SpawnFailure['reason'] => {
  if (error instanceof Deno.errors.NotFound) {
    return 'not-found'
  }
  if (error instanceof Deno.errors.PermissionDenied) {
    return 'not-executable'
  }
  if (typeof error !== 'object' || error === null) {
    return 'unknown'
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

const toSpawnFailure = (error: unknown): SpawnFailure => ({
  reason: reasonOf(error),
  message: error instanceof Error ? error.message : 'unknown error',
})

const describeOxlintSpawnFailure = (binaryPath: string, failure: SpawnFailure): string => {
  if (failure.reason === 'not-executable') {
    return `oxlint-guard: oxlint binary found at ${binaryPath} but is not executable: ${failure.message}`
  }
  if (failure.reason === 'not-found') {
    return `oxlint-guard: oxlint binary at ${binaryPath} could not be launched (missing or broken): ${failure.message}`
  }
  return `oxlint-guard: failed to run the oxlint binary at ${binaryPath}: ${failure.message}`
}

const describeDenoSpawnFailure = (failure: SpawnFailure): string => {
  if (failure.reason === 'not-found') {
    return 'oxlint-guard: deno not found on PATH. Install Deno to check and lint Deno-scripted files.'
  }
  if (failure.reason === 'not-executable') {
    return `oxlint-guard: deno found on PATH but is not executable: ${failure.message}`
  }
  return `oxlint-guard: failed to run deno: ${failure.message}`
}

const describeBrokenBinary = (path: string): string =>
  `oxlint-guard: oxlint binary found at ${path} but is not executable.\n` +
  'Remove it (or fix its permissions) and install oxlint locally.'

const walkUp = (startDir: string): readonly string[] => {
  const dirs: string[] = []
  let dir = startDir
  let parent = dirname(dir)
  while (parent !== dir) {
    dirs.push(dir)
    dir = parent
    parent = dirname(dir)
  }
  dirs.push(dir)
  return dirs
}

const withinRoot = (root: string, dir: string): boolean => dir === root || dir.startsWith(root + SEPARATOR)

// The prefix of walkUp(startDir) that stays inside root, root included.
const dirsUpToRoot = (startDir: string, root: string): readonly string[] => {
  const walked = walkUp(startDir)
  const firstOutside = walked.findIndex((dir) => !withinRoot(root, dir))
  return firstOutside === -1 ? walked : walked.slice(0, firstOutside)
}

const findProjectRoot = async (deps: LintGuardDeps, cwd: string): Promise<string> => {
  const fromEnv = Deno.env.get(PROJECT_ROOT_ENV)
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return resolve(fromEnv)
  }
  // Nearest enclosing git/worktree root — a .git entry may be a directory or,
  // in a worktree, a file pointing at the real git dir.
  for (const dir of walkUp(cwd)) {
    if (await deps.exists(join(dir, '.git'))) {
      return dir
    }
  }
  return cwd
}

const findFirstExisting = async (
  deps: LintGuardDeps,
  candidates: readonly string[],
): Promise<string | undefined> => {
  for (const candidate of candidates) {
    if (await deps.exists(candidate)) {
      return candidate
    }
  }
  return undefined
}

// The first existing candidate is the local binary, whatever state it is in:
// a candidate that exists but can never run (a directory) must be reported as
// broken rather than silently skipped so the walk cannot climb to an ancestor.
const findOxlintBinary = async (
  deps: LintGuardDeps,
  candidates: readonly string[],
): Promise<string | undefined> => {
  for (const candidate of candidates) {
    if (!(await deps.exists(candidate))) {
      continue
    }
    let isDirectory = false
    try {
      isDirectory = (await deps.stat(candidate)).isDirectory
    } catch {
      isDirectory = false
    }
    if (isDirectory) {
      throw new OxlintBinaryNotExecutable({ path: candidate })
    }
    return candidate
  }
  return undefined
}

const readFirstLine = async (deps: LintGuardDeps, filePath: string): Promise<string | undefined> => {
  try {
    const firstChunk = await deps.readTextFile(filePath)
    const firstLine = firstChunk.split('\n', 1)[0] ?? ''
    return firstLine === '' ? undefined : firstLine
  } catch {
    return undefined
  }
}

const binaryCandidates = (dir: string): readonly string[] => {
  const bin = join(dir, 'node_modules', '.bin')
  return SEPARATOR === '\\' ? [join(bin, 'oxlint.cmd'), join(bin, 'oxlint')] : [join(bin, 'oxlint')]
}

interface GatheredFacts {
  readonly resolvedPath: string
  readonly exists: boolean
  readonly firstLine: string | undefined
  readonly configPath: string | undefined
  readonly oxlintBinary: string | undefined
  readonly lockfile: string | undefined
  readonly denoConfig: string | undefined
}

const DENO_CONFIG_BASENAMES: readonly string[] = ['deno.json', 'deno.jsonc']

const gather = async (deps: LintGuardDeps, filePath: string, cwd: string): Promise<GatheredFacts> => {
  const resolved = resolve(cwd, filePath)
  const root = await findProjectRoot(deps, cwd)
  const dirs = dirsUpToRoot(dirname(resolved), root)
  const exists = await deps.exists(resolved)
  const firstLine = exists ? await readFirstLine(deps, resolved) : undefined
  const configPath = await findFirstExisting(
    deps,
    dirs.flatMap((dir) => OXLINT_CONFIG_BASENAMES.map((name) => join(dir, name))),
  )
  const oxlintBinary = await findOxlintBinary(
    deps,
    dirs.flatMap((dir) => binaryCandidates(dir)),
  )
  const foundLockfile = await findFirstExisting(
    deps,
    dirs.flatMap((dir) => LOCKFILE_BASENAMES.map((name) => join(dir, name))),
  )
  const lockfile = foundLockfile === undefined ? undefined : basename(foundLockfile)
  const denoConfig = await findFirstExisting(
    deps,
    dirs.flatMap((dir) => DENO_CONFIG_BASENAMES.map((name) => join(dir, name))),
  )
  return { resolvedPath: resolved, exists, firstLine, configPath, oxlintBinary, lockfile, denoConfig }
}

// Keeps draining (so the child never blocks on a full pipe) but accumulates at
// most OUTPUT_CAP_BYTES, appending the marker when bytes were cut.
const drainToString = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (truncated) {
      continue
    }
    const room = OUTPUT_CAP_BYTES - total
    if (room <= 0) {
      truncated = true
      continue
    }
    const take = Math.min(room, value.length)
    chunks.push(value.subarray(0, take))
    total += take
    if (take < value.length) {
      truncated = true
    }
  }
  reader.releaseLock()
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  const text = new TextDecoder().decode(bytes)
  return truncated ? `${text}${TRUNCATION_MARKER}` : text
}

const productionRunCommand = async (spec: CommandSpec): Promise<ProcessResult> => {
  const child = new Deno.Command(spec.command, {
    args: [...spec.args],
    cwd: spec.cwd,
    env: { ...spec.env },
    stdin: 'null',
    stdout: 'piped',
    stderr: 'piped',
    signal: spec.signal,
  }).spawn()
  // Read both streams concurrently: draining them sequentially would deadlock
  // once one stream exceeds its ~64 KiB pipe buffer while the other is still
  // being drained.
  const [stdout, stderr] = await Promise.all([drainToString(child.stdout), drainToString(child.stderr)])
  const status = await child.status
  return { exitCode: status.code, stdout, stderr }
}

export const productionDeps: LintGuardDeps = {
  readTextFile: (path) => Deno.readTextFile(path),
  exists: async (path) => {
    try {
      await Deno.stat(path)
      return true
    } catch {
      return false
    }
  },
  stat: async (path) => ({ isDirectory: (await Deno.stat(path)).isDirectory }),
  runCommand: productionRunCommand,
}

type RunOutcome =
  | { readonly kind: 'result'; readonly result: ProcessResult }
  | { readonly kind: 'spawn-failure'; readonly failure: SpawnFailure }
  | { readonly kind: 'timeout' }

const runWithTimeout = (
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<ProcessResult>,
): Promise<RunOutcome> => {
  const signal = AbortSignal.timeout(timeoutMs)
  return new Promise((resolvePromise) => {
    let settled = false
    const onAbort = (): void => {
      if (settled) {
        return
      }
      settled = true
      signal.removeEventListener('abort', onAbort)
      resolvePromise({ kind: 'timeout' })
    }
    if (signal.aborted) {
      resolvePromise({ kind: 'timeout' })
      return
    }
    signal.addEventListener('abort', onAbort)
    run(signal).then(
      (result) => {
        if (settled) {
          return
        }
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolvePromise({ kind: 'result', result })
      },
      (error: unknown) => {
        if (settled) {
          return
        }
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolvePromise({ kind: 'spawn-failure', failure: toSpawnFailure(error) })
      },
    )
  })
}

const buildOxlintSpec = (run: RunOxlint, cwd: string, typeAware: boolean, signal: AbortSignal): CommandSpec => {
  const args = [
    ...(typeAware ? ['--type-aware', '--type-check'] : []),
    '-f',
    'unix',
    '-c',
    run.configPath,
    // A file whose name begins with `-` must be treated as a positional path,
    // not parsed as an oxlint flag.
    '--',
    run.filePath,
  ]
  const invocation = invocationFor(run.oxlintBinary, args)
  return {
    command: invocation.command,
    args: invocation.args,
    cwd,
    env: minimalEnv(),
    signal,
  }
}

const runDeno = async (deps: LintGuardDeps, filePath: string, timeoutMs: number): Promise<HookResult> => {
  const cwd = dirname(filePath)
  const env = minimalEnv()
  const checkAttempt = await runWithTimeout(
    timeoutMs,
    (signal) => deps.runCommand({ command: 'deno', args: ['check', '--', filePath], cwd, env, signal }),
  )
  if (checkAttempt.kind === 'spawn-failure') {
    return block(describeDenoSpawnFailure(checkAttempt.failure))
  }
  if (checkAttempt.kind === 'timeout') {
    // A hung check is not evidence of a lint failure — never block on it.
    return allow()
  }
  const check = checkAttempt.result
  if (check.exitCode !== 0) {
    return block(`oxlint-guard: deno check failed for ${filePath}:\n${stderrOrStdout(check)}`)
  }
  const lintAttempt = await runWithTimeout(
    timeoutMs,
    (signal) => deps.runCommand({ command: 'deno', args: ['lint', '--', filePath], cwd, env, signal }),
  )
  if (lintAttempt.kind === 'spawn-failure') {
    return block(describeDenoSpawnFailure(lintAttempt.failure))
  }
  if (lintAttempt.kind === 'timeout') {
    // A hung lint pass is not evidence of a lint failure — never block on it.
    return allow()
  }
  const lint = lintAttempt.result
  if (lint.exitCode !== 0) {
    return block(`oxlint-guard: deno lint failed for ${filePath}:\n${stderrOrStdout(lint)}`)
  }
  return allow()
}

const runOxlint = async (deps: LintGuardDeps, run: RunOxlint, timeoutMs: number): Promise<HookResult> => {
  const cwd = dirname(run.configPath)
  const firstAttempt = await runWithTimeout(
    timeoutMs,
    (signal) => deps.runCommand(buildOxlintSpec(run, cwd, true, signal)),
  )
  if (firstAttempt.kind === 'spawn-failure') {
    // A binary that cannot be spawned will not start on retry either — say
    // what is wrong instead of retrying or reporting a bogus violation.
    return block(describeOxlintSpawnFailure(run.oxlintBinary, firstAttempt.failure))
  }
  if (firstAttempt.kind === 'result') {
    const firstVerdict = classifyLintResult({ result: firstAttempt.result, canRetry: true })
    if (!firstVerdict.ok) {
      return block(describeLintViolation(firstVerdict.error, { typeAware: true }))
    }
    if (firstVerdict.value._tag !== 'RetryWithoutTypeAware') {
      return allow()
    }
  }
  // The type-aware pass timed out or its backend is unavailable — retry
  // without type information rather than losing the result entirely.
  const retryAttempt = await runWithTimeout(
    timeoutMs,
    (signal) => deps.runCommand(buildOxlintSpec(run, cwd, false, signal)),
  )
  if (retryAttempt.kind === 'spawn-failure') {
    return block(describeOxlintSpawnFailure(run.oxlintBinary, retryAttempt.failure))
  }
  if (retryAttempt.kind === 'timeout') {
    // A timeout is not evidence of a lint failure — never fabricate a block.
    return allow()
  }
  const retryVerdict = classifyLintResult({ result: retryAttempt.result, canRetry: false })
  if (!retryVerdict.ok) {
    return block(describeLintViolation(retryVerdict.error, { typeAware: false }))
  }
  return allow()
}

const executePlan = (deps: LintGuardDeps, plan: LintPlan, timeoutMs: number): Promise<HookResult> => {
  switch (plan._tag) {
    case 'Skip':
      return Promise.resolve(allow())
    case 'RunDeno':
      return runDeno(deps, plan.filePath, timeoutMs)
    case 'RunOxlint':
      return runOxlint(deps, plan, timeoutMs)
  }
}

export const runLintGuard = async (
  raw: string,
  cwd: string,
  deps: LintGuardDeps,
  options: LintGuardOptions = {},
): Promise<HookResult> => {
  const timeoutMs = options.commandTimeoutMs ?? LINT_COMMAND_TIMEOUT_MS
  try {
    const decoded = decodeEditCommand(raw)
    if (decoded === undefined) {
      return allow()
    }
    const facts = await gather(deps, decoded.filePath, cwd)
    const plan = decideLintPlan({
      resolvedPath: facts.resolvedPath,
      extension: extname(facts.resolvedPath).slice(1),
      exists: facts.exists,
      firstLine: facts.firstLine,
      configPath: facts.configPath,
      oxlintBinary: facts.oxlintBinary,
      lockfile: facts.lockfile,
      denoConfig: facts.denoConfig,
    })
    if (!plan.ok) {
      return block(describeLintFailure(plan.error))
    }
    return await executePlan(deps, plan.value, timeoutMs)
  } catch (error) {
    if (error instanceof OxlintBinaryNotExecutable) {
      return block(describeBrokenBinary(error.path))
    }
    throw error
  }
}

// A hook payload larger than 1 MiB is not a legitimate edit payload; capping
// stdin is defense in depth so a runaway pipe cannot exhaust the process.

const readStdin = async (): Promise<string | undefined> => {
  const reader = Deno.stdin.readable.getReader()
  const decoder = new TextDecoder()
  let data = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (data.length + value.byteLength > HOOK_STDIN_CAP_BYTES) {
      reader.releaseLock()
      return undefined
    }
    data += decoder.decode(value, { stream: true })
  }
  data += decoder.decode()
  reader.releaseLock()
  return data
}

const runEntryPoint = async (): Promise<void> => {
  const stdin = await readStdin()
  // A payload this guard cannot read is a skip, exactly like stdin that is not a hook payload.
  // This hook is PostToolUse: the write has already landed, so there is nothing left to veto and
  // exit 2 would only hand the agent a message it cannot act on. The PreToolUse config guard,
  // which can still veto, fails closed on the same overflow.
  if (stdin === undefined) {
    Deno.exit(0)
  }
  try {
    const result = await runLintGuard(stdin, Deno.cwd(), productionDeps)
    if (result.stderr !== '') {
      console.error(result.stderr)
    }
    Deno.exit(result.exitCode)
  } catch (error) {
    // Claude Code shows a PostToolUse hook's stderr to the agent on exit 2 and nowhere else, so a
    // defect in the guard must exit 2 or the lint verdict disappears with the process.
    console.error(`oxlint-guard: the lint guard failed: ${error instanceof Error ? error.message : String(error)}`)
    Deno.exit(2)
  }
}

if (import.meta.main) {
  await runEntryPoint()
}
