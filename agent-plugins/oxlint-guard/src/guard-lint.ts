// PostToolUse lint guard: after an edit to a lintable file, run oxlint against
// the project's own nearest config (or `deno check` + `deno lint` for files
// carrying a deno shebang) and report violations back to the agent. Pure
// decisions first (decideLintPlan, classifyLintResult), then a thin shell
// (gather facts, run linter subprocesses with a per-command timeout, truncate
// output). Runs on Deno with --allow-read --allow-run --allow-env, never net.

import * as path from '@std/path'
import { decodePayload, denoExists, LINTABLE_EXTENSIONS, OXLINT_CONFIG_BASENAMES, readStdin } from './payload.ts'
import type { EditCommand } from './payload.ts'

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

export interface ProcessResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

type SpawnFailureReason = 'not-found' | 'not-executable' | 'unknown'

interface SpawnFailure {
  readonly reason: SpawnFailureReason
  readonly message: string
}

type RunOutcome =
  | { readonly tag: 'result'; readonly result: ProcessResult }
  | { readonly tag: 'timeout' }
  | { readonly tag: 'spawn-failure'; readonly failure: SpawnFailure }

export interface Runner {
  readonly run: (
    program: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    timeoutMs: number,
  ) => Promise<RunOutcome>
}

export interface LintFs {
  readonly exists: (target: string) => Promise<boolean>
  readonly isDirectory: (target: string) => Promise<boolean>
  readonly readFirstLine: (target: string) => Promise<string | null>
}

type LintPlan =
  | { readonly tag: 'skip'; readonly reason: string }
  | { readonly tag: 'run-deno'; readonly filePath: string }
  | {
    readonly tag: 'run-oxlint'
    readonly filePath: string
    readonly configPath: string
    readonly oxlintBinary: string
  }

type LintFailure =
  | { readonly tag: 'no-oxlint-config'; readonly installHint: string }
  | { readonly tag: 'no-oxlint-binary'; readonly installHint: string }

interface LintFacts {
  readonly toolName: string
  readonly resolvedPath: string
  readonly extension: string
  readonly exists: boolean
  readonly firstLine: string | null
  readonly configPath: string | null
  readonly oxlintBinary: string | null
  readonly lockfile: string | null
}

export interface HookResult {
  readonly exitCode: number
  readonly stderr: string
}

// Per-command budget for one linter invocation. Worst case inside the 120s
// hook cap: oxlint type-aware (30s) + its retry (30s), or deno check + lint
// (30s each), plus stdin and file gathering — comfortably under the cap while
// a cold type-aware backend still gets room on a large file.
const LINT_COMMAND_TIMEOUT_MS = 30_000

// 64 KiB per stream bounds both the buffered memory and the text that reaches
// the block message (which carries a single stream).
const OUTPUT_CAP_BYTES = 64 * 1024

// Appended when a drained stream exceeded its byte budget, so the reader of a
// block message knows the output was cut.
export const TRUNCATION_MARKER =
  `\n[output truncated at ${OUTPUT_CAP_BYTES} bytes; run the linter directly for full output]`

// ---------------------------------------------------------------------------
// Plan: what to run for an edited file.
// ---------------------------------------------------------------------------

// Lockfile basename -> install command. The detected package manager is used ONLY to
// word the remediation hint; nothing is ever executed with it.
const LOCKFILE_INSTALL_COMMANDS: Readonly<Record<string, string>> = {
  'pnpm-lock.yaml': 'pnpm add -D oxlint',
  'package-lock.json': 'npm install -D oxlint',
  'yarn.lock': 'yarn add -D oxlint',
  'bun.lockb': 'bun add -d oxlint',
  'bun.lock': 'bun add -d oxlint',
}

// Walk targets for the install hint: the same lockfiles, in the same order.
const LOCKFILE_BASENAMES: readonly string[] = Object.keys(LOCKFILE_INSTALL_COMMANDS)

const NO_LOCKFILE_HINT = 'install oxlint as a dev dependency of this project'

const installHintFor = (lockfile: string | null): string =>
  lockfile === null ? NO_LOCKFILE_HINT : LOCKFILE_INSTALL_COMMANDS[lockfile] ?? NO_LOCKFILE_HINT

const isLintableExtension = (extension: string): boolean =>
  (LINTABLE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())

const isDenoShebang = (firstLine: string | null): boolean => firstLine !== null && /^#!.*\bdeno\b/.test(firstLine)

const decideLintPlan = (facts: LintFacts): LintPlan | LintFailure => {
  if (!facts.exists) {
    return { tag: 'skip', reason: 'file-missing' }
  }
  if (!isLintableExtension(facts.extension)) {
    return { tag: 'skip', reason: 'not-lintable-extension' }
  }
  if (isDenoShebang(facts.firstLine)) {
    return { tag: 'run-deno', filePath: facts.resolvedPath }
  }
  if (facts.configPath !== null && facts.oxlintBinary !== null) {
    return {
      tag: 'run-oxlint',
      filePath: facts.resolvedPath,
      configPath: facts.configPath,
      oxlintBinary: facts.oxlintBinary,
    }
  }
  if (facts.configPath === null) {
    return { tag: 'no-oxlint-config', installHint: installHintFor(facts.lockfile) }
  }
  return { tag: 'no-oxlint-binary', installHint: installHintFor(facts.lockfile) }
}

// ---------------------------------------------------------------------------
// Outcome classification: what a linter's exit means.
// ---------------------------------------------------------------------------

const NO_FILES_FOUND = /No files found to lint/i
const PATH_OUTSIDE_ROOT = /path is expected to be under the root/i
const TSGOLINT_MISSING = /tsgolint|oxlint-tsgolint/i

const combinedOutput = (result: ProcessResult): string => result.stdout + '\n' + result.stderr

const stderrOrStdout = (result: ProcessResult): string => (result.stderr !== '' ? result.stderr : result.stdout)

type LintOutcome =
  | {
    readonly tag: 'outcome'
    readonly outcome: 'clean' | 'benign-no-files' | 'ignored-path' | 'retry-without-type-aware'
  }
  | { readonly tag: 'violation'; readonly output: string }

const classifyLintResult = (result: ProcessResult, canRetry: boolean): LintOutcome => {
  if (result.exitCode === 0) {
    return { tag: 'outcome', outcome: 'clean' }
  }
  if (NO_FILES_FOUND.test(combinedOutput(result))) {
    return { tag: 'outcome', outcome: 'benign-no-files' }
  }
  if (PATH_OUTSIDE_ROOT.test(combinedOutput(result))) {
    return { tag: 'outcome', outcome: 'ignored-path' }
  }
  if (canRetry && TSGOLINT_MISSING.test(combinedOutput(result))) {
    return { tag: 'outcome', outcome: 'retry-without-type-aware' }
  }
  return { tag: 'violation', output: stderrOrStdout(result) }
}

// ---------------------------------------------------------------------------
// Messages.
// ---------------------------------------------------------------------------

// Same set as OXLINT_CONFIG_BASENAMES, rendered as the prose list in stderr.
const ACCEPTED_CONFIG_NAMES = `${OXLINT_CONFIG_BASENAMES.slice(0, -1).join(', ')}, or ${
  OXLINT_CONFIG_BASENAMES[OXLINT_CONFIG_BASENAMES.length - 1]
}`

const describeLintFailure = (failure: LintFailure): string => {
  switch (failure.tag) {
    case 'no-oxlint-config':
      return 'oxlint-guard: no oxlint config found in any directory up from the edited file.\n' +
        `Add one of ${ACCEPTED_CONFIG_NAMES} at the project root, and install oxlint locally: ${failure.installHint}`
    case 'no-oxlint-binary':
      return 'oxlint-guard: no local oxlint binary (node_modules/.bin/oxlint) found in any directory up from the edited file.\n' +
        `Install oxlint locally: ${failure.installHint}\n` +
        `Make sure an oxlint config (${ACCEPTED_CONFIG_NAMES}) exists at the project root.`
  }
}

const FIX_ROOT_CAUSE = [
  'Fix the root cause of each violation — do not suppress the rule with an eslint-disable comment,',
  'and do not weaken the oxlint config to make the check pass.',
].join('\n')

const TYPE_AWARE_UNAVAILABLE = [
  'the type-aware backend (oxlint-tsgolint) was unavailable, so these findings come from',
  'the lint pass without type information.',
].join('\n')

const describeLintViolation = (output: string, options: { readonly typeAware: boolean }): string =>
  `oxlint-guard: lint violations found.\n${
    options.typeAware ? '' : TYPE_AWARE_UNAVAILABLE + '\n'
  }${FIX_ROOT_CAUSE}\n\n${output}`

const allow = (): HookResult => ({ exitCode: 0, stderr: '' })

const block = (stderr: string): HookResult => ({ exitCode: 2, stderr })

const describeBrokenBinary = (binaryPath: string): string =>
  `oxlint-guard: oxlint binary found at ${binaryPath} but is not executable.\n` +
  'Remove it (or fix its permissions) and install oxlint locally.'

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

// ---------------------------------------------------------------------------
// Shell: fact gathering and linter subprocesses.
// ---------------------------------------------------------------------------

const CONFIG_BASENAMES: readonly string[] = OXLINT_CONFIG_BASENAMES

// The walk for configs and binaries must never escape the project: on a shared
// host, a binary planted in an ancestor directory (e.g. /tmp/node_modules/
// .bin/oxlint) would otherwise be selected and run against the agent's files.
const PROJECT_ROOT_ENV = 'CLAUDE_PROJECT_DIR'

const walkUp = (startDir: string): readonly string[] => {
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

const withinRoot = (root: string, dir: string): boolean => dir === root || dir.startsWith(root + path.SEPARATOR)

// The prefix of walkUp(startDir) that stays inside root, root included.
const dirsUpToRoot = (startDir: string, root: string): readonly string[] => {
  const walked = walkUp(startDir)
  const firstOutside = walked.findIndex((dir) => !withinRoot(root, dir))
  return firstOutside === -1 ? walked : walked.slice(0, firstOutside)
}

const findProjectRoot = async (
  fs: LintFs,
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<string> => {
  const fromEnv = env[PROJECT_ROOT_ENV]
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return path.resolve(fromEnv)
  }
  // Nearest enclosing git/worktree root — a .git entry may be a directory or,
  // in a worktree, a file pointing at the real git dir.
  for (const dir of walkUp(cwd)) {
    if (await fs.exists(path.join(dir, '.git'))) {
      return dir
    }
  }
  return cwd
}

const findFirstExisting = async (fs: LintFs, candidates: readonly string[]): Promise<string | null> => {
  for (const candidate of candidates) {
    if (await fs.exists(candidate)) {
      return candidate
    }
  }
  return null
}

// The first existing candidate is the local binary, whatever state it is in:
// a candidate that exists but can never run (a directory) must be reported as
// broken rather than silently skipped so the walk cannot climb to an ancestor.
const findOxlintBinary = async (
  fs: LintFs,
  candidates: readonly string[],
): Promise<{ readonly binary: string | null; readonly broken: string | null }> => {
  for (const candidate of candidates) {
    if (!await fs.exists(candidate)) {
      continue
    }
    if (await fs.isDirectory(candidate)) {
      return { binary: null, broken: candidate }
    }
    return { binary: candidate, broken: null }
  }
  return { binary: null, broken: null }
}

const binaryCandidates = (dir: string): readonly string[] => {
  const bin = path.join(dir, 'node_modules', '.bin')
  return path.SEPARATOR === '\\'
    ? [path.join(bin, 'oxlint.cmd'), path.join(bin, 'oxlint')]
    : [path.join(bin, 'oxlint')]
}

interface GatheredFacts {
  readonly resolvedPath: string
  readonly exists: boolean
  readonly firstLine: string | null
  readonly configPath: string | null
  readonly oxlintBinary: string | null
  readonly brokenBinary: string | null
  readonly lockfile: string | null
}

const gather = async (
  fs: LintFs,
  filePath: string,
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<GatheredFacts> => {
  const resolved = path.resolve(cwd, filePath)
  const root = await findProjectRoot(fs, cwd, env)
  const dirs = dirsUpToRoot(path.dirname(resolved), root)
  const extension = path.extname(resolved).slice(1)
  const exists = await fs.exists(resolved)
  // The first line only feeds the deno-shebang check, which is unreachable for
  // a missing or non-lintable file — skip the read there entirely.
  const firstLine = exists && isLintableExtension(extension) ? await fs.readFirstLine(resolved) : null
  const configPath = await findFirstExisting(
    fs,
    dirs.flatMap((dir) => CONFIG_BASENAMES.map((name) => path.join(dir, name))),
  )
  const binary = await findOxlintBinary(fs, dirs.flatMap((dir) => binaryCandidates(dir)))
  const lockfileFound = await findFirstExisting(
    fs,
    dirs.flatMap((dir) => LOCKFILE_BASENAMES.map((name) => path.join(dir, name))),
  )
  return {
    resolvedPath: resolved,
    exists,
    firstLine,
    configPath,
    oxlintBinary: binary.binary,
    brokenBinary: binary.broken,
    lockfile: lockfileFound === null ? null : path.basename(lockfileFound),
  }
}

// Keeps draining (so the child never blocks on a full pipe) but accumulates at
// most OUTPUT_CAP_BYTES, appending the marker when bytes were cut.
const drainCapped = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value === undefined || truncated) {
        continue
      }
      const room = OUTPUT_CAP_BYTES - total
      if (value.byteLength >= room) {
        if (room > 0) {
          chunks.push(value.subarray(0, room))
          total += room
        }
        truncated = true
        continue
      }
      chunks.push(value)
      total += value.byteLength
    }
    const merged = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    const text = new TextDecoder().decode(merged)
    return truncated ? text + TRUNCATION_MARKER : text
  } finally {
    reader.releaseLock()
  }
}

const reasonOf = (error: unknown): SpawnFailureReason => {
  if (typeof error !== 'object' || error === null) {
    return 'unknown'
  }
  const name = 'name' in error ? (error as { readonly name?: unknown }).name : undefined
  if (name === 'NotFound') {
    return 'not-found'
  }
  if (name === 'PermissionDenied' || name === 'NotCapable') {
    return 'not-executable'
  }
  return 'unknown'
}

// The byte budget applies to every result the guard reads, whether the runner
// already drained the pipe within the budget (realRunner) or handed back a
// canned string (tests): a result that still exceeds the cap is cut here at a
// character boundary. Strings that already carry the marker are left untouched,
// so the real path is never processed twice.
const capOutput = (text: string): string => {
  if (text.endsWith(TRUNCATION_MARKER)) {
    return text
  }
  if (new TextEncoder().encode(text).length <= OUTPUT_CAP_BYTES) {
    return text
  }
  // Back up from the byte budget to a character boundary so the cut never
  // lands inside a multi-byte sequence.
  let cut = OUTPUT_CAP_BYTES
  while (cut > 0 && (text.charCodeAt(cut) & 0xc0) === 0x80) {
    cut -= 1
  }
  return text.slice(0, cut) + TRUNCATION_MARKER
}

const capResult = (result: ProcessResult): ProcessResult => ({
  ...result,
  stdout: capOutput(result.stdout),
  stderr: capOutput(result.stderr),
})

const runCapped = (
  runner: Runner,
  program: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<RunOutcome> =>
  runner.run(program, args, cwd, env, timeoutMs).then((outcome) =>
    outcome.tag === 'result' ? { tag: 'result', result: capResult(outcome.result) } : outcome
  )

const realRunner: Runner = {
  async run(program, args, cwd, env, timeoutMs) {
    const signal = AbortSignal.timeout(timeoutMs)
    try {
      const command = new Deno.Command(program, {
        args,
        cwd,
        env,
        stdout: 'piped',
        stderr: 'piped',
        signal,
      })
      const process = command.spawn()
      const [stdout, stderr] = await Promise.all([drainCapped(process.stdout), drainCapped(process.stderr)])
      const status = await process.status
      if (signal.aborted) {
        return { tag: 'timeout' }
      }
      return { tag: 'result', result: { exitCode: status.code, stdout, stderr } }
    } catch (error) {
      if (signal.aborted) {
        return { tag: 'timeout' }
      }
      return {
        tag: 'spawn-failure',
        failure: { reason: reasonOf(error), message: error instanceof Error ? error.message : 'unknown error' },
      }
    }
  },
}

// Minimal environment for the linter subprocesses. Forwarding the agent's whole
// environment would hand a binary we do not control — an ancestor-planted
// oxlint, or deno resolved from PATH — every credential the agent holds.
// Deno.Command replaces the child's environment entirely, so only these keys
// survive.
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

const minimalEnv = (env: Readonly<Record<string, string | undefined>>): Record<string, string> => {
  const minimal: Record<string, string> = {}
  for (const key of ALLOWLISTED_ENV_VARS) {
    const value = env[key]
    if (value !== undefined) {
      minimal[key] = value
    }
  }
  return minimal
}

const oxlintArgs = (run: Extract<LintPlan, { readonly tag: 'run-oxlint' }>, typeAware: boolean): string[] => [
  ...(typeAware ? ['--type-aware', '--type-check'] : []),
  '-f',
  'agent',
  '-c',
  run.configPath,
  // A file whose name begins with `-` must be treated as a positional path,
  // not parsed as an oxlint flag.
  '--',
  run.filePath,
]

const runDeno = async (
  runner: Runner,
  filePath: string,
  timeoutMs: number,
  env: Readonly<Record<string, string | undefined>>,
): Promise<HookResult> => {
  const cwd = path.dirname(filePath)
  const minimal = minimalEnv(env)
  const checkAttempt = await runCapped(runner, 'deno', ['check', '--', filePath], cwd, minimal, timeoutMs)
  if (checkAttempt.tag === 'spawn-failure') {
    return block(describeDenoSpawnFailure(checkAttempt.failure))
  }
  if (checkAttempt.tag === 'timeout') {
    // A hung check is not evidence of a lint failure — never block on it.
    return allow()
  }
  if (checkAttempt.result.exitCode !== 0) {
    return block(`oxlint-guard: deno check failed for ${filePath}:\n${stderrOrStdout(checkAttempt.result)}`)
  }
  const lintAttempt = await runCapped(runner, 'deno', ['lint', '--', filePath], cwd, minimal, timeoutMs)
  if (lintAttempt.tag === 'spawn-failure') {
    return block(describeDenoSpawnFailure(lintAttempt.failure))
  }
  if (lintAttempt.tag === 'timeout') {
    // A hung lint pass is not evidence of a lint failure — never block on it.
    return allow()
  }
  if (lintAttempt.result.exitCode !== 0) {
    return block(`oxlint-guard: deno lint failed for ${filePath}:\n${stderrOrStdout(lintAttempt.result)}`)
  }
  return allow()
}

const runOxlint = async (
  runner: Runner,
  run: Extract<LintPlan, { readonly tag: 'run-oxlint' }>,
  timeoutMs: number,
  env: Readonly<Record<string, string | undefined>>,
): Promise<HookResult> => {
  const cwd = path.dirname(run.configPath)
  const minimal = minimalEnv(env)
  const program = run.oxlintBinary.endsWith('.cmd') ? 'cmd.exe' : run.oxlintBinary
  const prefix = run.oxlintBinary.endsWith('.cmd') ? ['/c', run.oxlintBinary] : []

  const firstAttempt = await runCapped(runner, program, [...prefix, ...oxlintArgs(run, true)], cwd, minimal, timeoutMs)
  if (firstAttempt.tag === 'spawn-failure') {
    // A binary that cannot be spawned will not start on retry either — say
    // what is wrong instead of retrying or reporting a bogus violation.
    return block(describeOxlintSpawnFailure(run.oxlintBinary, firstAttempt.failure))
  }
  if (firstAttempt.tag === 'result') {
    const firstVerdict = classifyLintResult(firstAttempt.result, true)
    if (firstVerdict.tag === 'violation') {
      return block(describeLintViolation(firstVerdict.output, { typeAware: true }))
    }
    if (firstVerdict.outcome !== 'retry-without-type-aware') {
      return allow()
    }
  }
  // The type-aware pass timed out or its backend is unavailable — retry
  // without type information rather than losing the result entirely.
  const retryAttempt = await runCapped(runner, program, [...prefix, ...oxlintArgs(run, false)], cwd, minimal, timeoutMs)
  if (retryAttempt.tag === 'spawn-failure') {
    return block(describeOxlintSpawnFailure(run.oxlintBinary, retryAttempt.failure))
  }
  if (retryAttempt.tag === 'timeout') {
    // A timeout is not evidence of a lint failure — never fabricate a block.
    return allow()
  }
  const retryVerdict = classifyLintResult(retryAttempt.result, false)
  if (retryVerdict.tag === 'violation') {
    return block(describeLintViolation(retryVerdict.output, { typeAware: false }))
  }
  return allow()
}

export interface LintGuardOptions {
  readonly commandTimeoutMs: number
  readonly fs: LintFs
  readonly runner: Runner
  /**
   * Environment overrides consulted before Deno.env; tests pass a complete
   * record here so they never touch the real environment. Keys with an
   * undefined value count as unset.
   */
  readonly env: Readonly<Record<string, string | undefined>>
}

const defaultOptions = (): LintGuardOptions => ({
  commandTimeoutMs: LINT_COMMAND_TIMEOUT_MS,
  fs: realLintFs,
  runner: realRunner,
  env: {},
})

// The keys the guard ever reads: the allowlist (passed to children) plus the
// project-root override (never passed to children).
const ENV_KEYS: readonly string[] = [...ALLOWLISTED_ENV_VARS, PROJECT_ROOT_ENV]

// Snapshot the effective environment once at guard start — options.env wins
// per key, Deno.env fills the rest — so a one-shot hook process reads the
// process environment exactly once and every consumer sees the same record.
const snapshotEnv = (options: LintGuardOptions): Record<string, string | undefined> => {
  const env: Record<string, string | undefined> = {}
  for (const key of ENV_KEYS) {
    env[key] = key in options.env ? options.env[key] : Deno.env.get(key)
  }
  return env
}

const realLintFs: LintFs = {
  exists: denoExists,
  isDirectory: async (target) => {
    try {
      return (await Deno.stat(target)).isDirectory
    } catch {
      return false
    }
  },
  readFirstLine: async (target) => {
    try {
      const file = await Deno.open(target)
      try {
        const reader = file.readable.getReader()
        const decoder = new TextDecoder()
        let text = ''
        try {
          while (text.length < OUTPUT_CAP_BYTES) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            if (value === undefined) {
              continue
            }
            text += decoder.decode(value, { stream: true })
            if (text.includes('\n')) {
              break
            }
          }
          const firstLine = text.split('\n', 1)[0] ?? ''
          return firstLine === '' ? null : firstLine
        } finally {
          reader.releaseLock()
        }
      } finally {
        file.close()
      }
    } catch {
      return null
    }
  },
}

export const runLintGuard = async (
  raw: string,
  cwd: string,
  options: LintGuardOptions = defaultOptions(),
): Promise<HookResult> => {
  const command: EditCommand | undefined = decodePayload(raw)
  if (command === undefined) {
    return allow()
  }
  const env = snapshotEnv(options)
  const facts = await gather(options.fs, command.filePath, cwd, env)
  if (facts.brokenBinary !== null) {
    return block(describeBrokenBinary(facts.brokenBinary))
  }
  const plan = decideLintPlan({
    toolName: command.toolName,
    resolvedPath: facts.resolvedPath,
    extension: path.extname(facts.resolvedPath).slice(1),
    exists: facts.exists,
    firstLine: facts.firstLine,
    configPath: facts.configPath,
    oxlintBinary: facts.oxlintBinary,
    lockfile: facts.lockfile,
  })
  switch (plan.tag) {
    case 'skip':
      return allow()
    case 'no-oxlint-config':
    case 'no-oxlint-binary':
      return block(describeLintFailure(plan))
    case 'run-deno':
      return await runDeno(options.runner, plan.filePath, options.commandTimeoutMs, env)
    case 'run-oxlint':
      return await runOxlint(options.runner, plan, options.commandTimeoutMs, env)
  }
}

if (import.meta.main) {
  try {
    const stdin = await readStdin()
    // A payload this guard cannot read is a skip, exactly like stdin that is not
    // a hook payload. This hook is PostToolUse: the write has already landed, so
    // there is nothing left to veto and exit 2 would only hand the agent a
    // message it cannot act on. The PreToolUse config guard, which can still
    // veto, fails closed on the same overflow.
    if (stdin.tag === 'too-large') {
      Deno.exit(0)
    }
    const result = await runLintGuard(stdin.content, Deno.cwd())
    if (result.stderr !== '') {
      console.error(result.stderr)
    }
    Deno.exit(result.exitCode)
  } catch (error) {
    // A defect falls to 1 so a crashing hook never blocks every edit.
    console.error(`oxlint-guard: internal error: ${error instanceof Error ? error.message : String(error)}`)
    Deno.exit(1)
  }
}
