import { open, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import * as path from 'node:path'

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

export interface GuardFs {
  readonly exists: (target: string) => Promise<boolean>
  readonly readFirstLine: (target: string) => Promise<string | null>
}

export interface EditCommand {
  readonly toolName: string
  readonly filePath: string
}

interface GatherFacts {
  readonly resolvedPath: string
  readonly exists: boolean
  readonly extension: string
  readonly denoShebang: boolean
  readonly configPath: string | null
}

type SkipReason = 'file-missing' | 'not-lintable-extension' | 'no-oxlint-config'

type Plan =
  | { readonly tag: 'skip'; readonly reason: SkipReason }
  | { readonly tag: 'run-deno'; readonly filePath: string }
  | { readonly tag: 'run-oxlint'; readonly filePath: string; readonly configPath: string }

type LintOutcome =
  | { readonly tag: 'outcome' }
  | { readonly tag: 'retry-without-type-aware' }
  | { readonly tag: 'not-found' }
  | { readonly tag: 'violation'; readonly output: string }

export interface HookResult {
  readonly exitCode: number
  readonly stderr: string
}

export interface GuardOptions {
  readonly fs: GuardFs
  readonly runner: Runner
  readonly envOverrides: Readonly<Record<string, string | undefined>>
}

const EDIT_TOOL_NAMES: readonly string[] = [
  'Write',
  'Edit',
  'Update',
  'MultiEdit',
  'Create',
  'morph_mcp_edit-file',
  'morph_edit',
]

const LINTABLE_EXTENSIONS: readonly string[] = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mts',
  'cts',
  'mjs',
  'cjs',
  'vue',
  'svelte',
  'astro',
]

const PRIMARY_CONFIG_BASENAMES: readonly string[] = [
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
  'oxlint.config.ts',
  'oxlint.config.mts',
]
const FALLBACK_CONFIG_BASENAMES: readonly string[] = [
  'oxlint.config.js',
  'oxlint.config.mjs',
  'oxlint.config.cjs',
  'oxlint.json',
]
const CONFIG_BASENAMES: readonly string[] = [...PRIMARY_CONFIG_BASENAMES, ...FALLBACK_CONFIG_BASENAMES]

const COMMAND_BUDGET_MS = 30_000

const STDIN_CAP_BYTES = 1024 * 1024

const PROJECT_ROOT_ENV = 'CLAUDE_PROJECT_DIR'

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

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const decodePayload = (raw: string): EditCommand | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || typeof parsed.tool_name !== 'string' || !isRecord(parsed.tool_input)) {
    return undefined
  }
  if (!EDIT_TOOL_NAMES.includes(parsed.tool_name)) {
    return undefined
  }
  if (typeof parsed.tool_input.file_path !== 'string' || parsed.tool_input.file_path === '') {
    return undefined
  }
  return { toolName: parsed.tool_name, filePath: parsed.tool_input.file_path }
}

const DENO_SHEBANG = /^#!.*\bdeno\b/

const isLintableExtension = (extension: string): boolean =>
  (LINTABLE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())

interface PlanRule {
  readonly matches: (facts: GatherFacts) => boolean
  readonly plan: (facts: GatherFacts) => Plan
}

const SKIP_FILE_MISSING = (): Plan => ({ tag: 'skip', reason: 'file-missing' })
const SKIP_NOT_LINTABLE = (): Plan => ({ tag: 'skip', reason: 'not-lintable-extension' })
const SKIP_NO_CONFIG = (): Plan => ({ tag: 'skip', reason: 'no-oxlint-config' })

const PLAN_RULES: readonly PlanRule[] = [
  { matches: (f) => !f.exists, plan: SKIP_FILE_MISSING },
  { matches: (f) => !isLintableExtension(f.extension), plan: SKIP_NOT_LINTABLE },
  {
    matches: (f) => f.denoShebang,
    plan: (f) => ({ tag: 'run-deno', filePath: f.resolvedPath }),
  },
  { matches: (f) => f.configPath === null, plan: SKIP_NO_CONFIG },
  {
    matches: () => true,
    plan: (f) => ({ tag: 'run-oxlint', filePath: f.resolvedPath, configPath: f.configPath ?? '' }),
  },
]

const decidePlan = (facts: GatherFacts): Plan =>
  PLAN_RULES.find((rule) => rule.matches(facts))?.plan(facts) ?? PLAN_RULES.at(-1)!.plan(facts)

const combinedOutput = (result: ProcessResult): string => result.stdout + '\n' + result.stderr

const stderrOrStdout = (result: ProcessResult): string => (result.stderr !== '' ? result.stderr : result.stdout)

const NO_FILES_FOUND = /No files found to lint/i
const PATH_OUTSIDE_ROOT = /path is expected to be under the root/i
const OXLINT_PANIC = /panicked at/

const TSGOLINT_MISSING = /tsgolint/i
const OXLINT_NOT_FOUND = /ERR_PNPM|command .* not found/i

interface ClassifyRule {
  readonly matches: (combined: string, exitCode: number, canRetry: boolean) => boolean
  readonly outcome: (result: ProcessResult) => LintOutcome
}

const CLASSIFY_RULES: readonly ClassifyRule[] = [
  {
    matches: (_combined, exitCode) => exitCode === 0,
    outcome: () => ({ tag: 'outcome' }),
  },
  {
    matches: (combined) => NO_FILES_FOUND.test(combined),
    outcome: () => ({ tag: 'outcome' }),
  },
  {
    matches: (combined) => OXLINT_PANIC.test(combined) && PATH_OUTSIDE_ROOT.test(combined),
    outcome: () => ({ tag: 'outcome' }),
  },
  {
    matches: (combined, _exitCode, canRetry) => canRetry && TSGOLINT_MISSING.test(combined),
    outcome: () => ({ tag: 'retry-without-type-aware' }),
  },
  {
    matches: (combined, exitCode) => exitCode !== 0 && OXLINT_NOT_FOUND.test(combined),
    outcome: () => ({ tag: 'not-found' }),
  },
  {
    matches: () => true,
    outcome: (result) => ({ tag: 'violation', output: stderrOrStdout(result) }),
  },
]

const classifyResult = (result: ProcessResult, canRetry: boolean): LintOutcome => {
  const combined = combinedOutput(result)
  return (
    CLASSIFY_RULES.find((rule) => rule.matches(combined, result.exitCode, canRetry))?.outcome(result) ??
      CLASSIFY_RULES.at(-1)!.outcome(result)
  )
}

const MAX_OUTPUT_LINES = 30

const truncateOutput = (text: string): string => {
  let cut = text.indexOf('\n')
  for (let line = 1; line < MAX_OUTPUT_LINES && cut !== -1; line++) {
    cut = text.indexOf('\n', cut + 1)
  }
  if (cut === -1) {
    return text
  }
  return text.slice(0, cut) + '\n... [truncated — run the linter manually for full output]'
}

const diagnostic = (tool: string, output: string): string =>
  `⛔ ${tool} FAILED — INVOKE SKILLS FIRST.

Before fixing anything below, invoke skills that address why these rules fire.
You decide which — the hook will not map rules to skills for you.
Already-invoked skills do NOT count. Each failure demands NEW invocations.

--- ${tool} output ---
${truncateOutput(output)}

Find skills for the ROOT CAUSE above. Invoke them, THEN fix.`

const DENO_PREREQUISITE = 'deno (https://deno.land)'
const PNPM_PREREQUISITE = 'pnpm with oxlint as a dev dependency (pnpm add -D oxlint)'

const REASON_PHRASES: Record<SpawnFailureReason, string> = {
  'not-found': 'not found',
  'not-executable': 'not executable',
  unknown: 'spawn failed',
}

const spawnUnavailableHint = (missing: SpawnFailureReason, prerequisite: string): string =>
  `oxlint-guard-hook: ${prerequisite} could not be run (${
    REASON_PHRASES[missing]
  }) - the lint guard cannot check this file. Install the prerequisite per the plugin README and retry.`

type StdinResult = { readonly tag: 'content'; readonly content: string } | { readonly tag: 'too-large' }

export const readStdin = async (
  stream: ReadableStream<Uint8Array> = Deno.stdin.readable,
  cap: number = STDIN_CAP_BYTES,
): Promise<StdinResult> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let tooLarge = false
  try {
    while (!tooLarge) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value === undefined) {
        continue
      }
      if (total + value.byteLength > cap) {
        tooLarge = true
        break
      }
      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  if (tooLarge) {
    return { tag: 'too-large' }
  }
  const decoder = new TextDecoder()
  const parts = chunks.map((chunk) => decoder.decode(chunk, { stream: true }))
  parts.push(decoder.decode())
  return { tag: 'content', content: parts.join('') }
}

const realFs: GuardFs = {
  exists: async (target) => {
    try {
      await stat(target)
      return true
    } catch {
      return false
    }
  },
  readFirstLine: async (target) => {
    let file: FileHandle | undefined
    try {
      file = await open(target, 'r')
      const buffer = new Uint8Array(4096)
      const read = await file.read(buffer)
      const text = new TextDecoder().decode(buffer.subarray(0, read.bytesRead))
      const firstLine = text.split('\n', 1)[0] ?? ''
      return firstLine === '' ? null : firstLine
    } catch {
      return null
    } finally {
      await file?.close()
    }
  },
}

const snapshotEnv = (envOverrides: Readonly<Record<string, string | undefined>>): Record<string, string> => {
  const snapshot: Record<string, string> = {}
  for (const key of ALLOWLISTED_ENV_VARS) {
    const value = key in envOverrides ? envOverrides[key] : Deno.env.get(key)
    if (value !== undefined) {
      snapshot[key] = value
    }
  }
  return snapshot
}

const withinRoot = (root: string, dir: string): boolean => dir === root || dir.startsWith(root + path.sep)

const walkUp = (startDir: string, root: string): readonly string[] => {
  const dirs: string[] = []
  let dir = startDir
  while (withinRoot(root, dir)) {
    dirs.push(dir)
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return dirs
}

const findProjectRoot = async (fs: GuardFs, cwd: string, rootOverride: string | undefined): Promise<string> => {
  if (rootOverride !== undefined && rootOverride.trim() !== '') {
    return path.resolve(rootOverride)
  }
  let dir = cwd
  while (true) {
    if (await fs.exists(path.join(dir, '.git'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return cwd
    }
    dir = parent
  }
}

const firstExistingConfig = async (fs: GuardFs, dirs: readonly string[]): Promise<string | null> => {
  const candidates = dirs.flatMap((dir) => CONFIG_BASENAMES.map((name) => path.join(dir, name)))
  for (const candidate of candidates) {
    if (await fs.exists(candidate)) {
      return candidate
    }
  }
  return null
}

const gather = async (
  fs: GuardFs,
  filePath: string,
  cwd: string,
  rootOverride: string | undefined,
): Promise<GatherFacts> => {
  const resolvedPath = path.resolve(cwd, filePath)
  const extension = path.extname(resolvedPath).slice(1)
  const exists = await fs.exists(resolvedPath)
  const firstLine = exists ? await fs.readFirstLine(resolvedPath) : null
  const denoShebang = DENO_SHEBANG.test(firstLine ?? '')
  const needsConfig = exists && !denoShebang && isLintableExtension(extension)
  const configPath = needsConfig
    ? await firstExistingConfig(
      fs,
      walkUp(path.dirname(resolvedPath), await findProjectRoot(fs, cwd, rootOverride)),
    )
    : null
  return { resolvedPath, exists, extension, denoShebang, configPath }
}

const reasonOf = (error: unknown): SpawnFailureReason => {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
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
      const decode = async (stream: ReadableStream<Uint8Array>): Promise<string> => await new Response(stream).text()
      const drained = Promise.all([decode(process.stdout), decode(process.stderr)])
      const status = await process.status
      if (signal.aborted) {
        return { tag: 'timeout' }
      }
      const [stdout, stderr] = await drained
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

type GuardedOutcome<CanRetry extends boolean> =
  | HookResult
  | 'ok'
  | (CanRetry extends true ? 'retry-without-type-aware' : never)

interface GuardRun {
  readonly runner: Runner
  readonly program: string
  readonly args: string[]
  readonly cwd: string
  readonly env: Record<string, string>
  readonly prerequisite: string
  readonly toolLabel: string
}

async function runGuarded(run: GuardRun, canRetry: true): Promise<GuardedOutcome<true>>
async function runGuarded(run: GuardRun, canRetry: false): Promise<GuardedOutcome<false>>
async function runGuarded(run: GuardRun, canRetry: boolean): Promise<GuardedOutcome<boolean>> {
  const attempt = await run.runner.run(run.program, run.args, run.cwd, run.env, COMMAND_BUDGET_MS)
  if (attempt.tag === 'spawn-failure') {
    return { exitCode: 1, stderr: spawnUnavailableHint(attempt.failure.reason, run.prerequisite) }
  }
  if (attempt.tag === 'timeout') {
    return { exitCode: 0, stderr: '' }
  }
  const verdict = classifyResult(attempt.result, canRetry)
  if (verdict.tag === 'violation') {
    return { exitCode: 2, stderr: diagnostic(run.toolLabel, verdict.output) }
  }
  if (verdict.tag === 'not-found') {
    return { exitCode: 1, stderr: spawnUnavailableHint('not-found', run.prerequisite) }
  }
  if (verdict.tag === 'retry-without-type-aware') {
    return 'retry-without-type-aware'
  }
  return 'ok'
}

const runDenoPair = async (runner: Runner, filePath: string, env: Record<string, string>): Promise<HookResult> => {
  const cwd = path.dirname(filePath)
  const check = await runGuarded(
    {
      runner,
      program: 'deno',
      args: ['check', '--', filePath],
      cwd,
      env,
      prerequisite: DENO_PREREQUISITE,
      toolLabel: 'DENO CHECK',
    },
    false,
  )
  if (check !== 'ok') {
    return check
  }
  const lint = await runGuarded(
    {
      runner,
      program: 'deno',
      args: ['lint', '--', filePath],
      cwd,
      env,
      prerequisite: DENO_PREREQUISITE,
      toolLabel: 'DENO LINT',
    },
    false,
  )
  return lint === 'ok' ? { exitCode: 0, stderr: '' } : lint
}

const oxlintArgs = (
  plan: { readonly filePath: string; readonly configPath: string },
  typeAware: boolean,
): string[] => [
  'exec',
  'oxlint',
  '-c',
  plan.configPath,
  ...(typeAware ? ['--type-aware', '--type-check'] : []),
  '-f',
  'unix',
  plan.filePath,
]

const runOxlint = async (
  runner: Runner,
  plan: { readonly filePath: string; readonly configPath: string },
  env: Record<string, string>,
): Promise<HookResult> => {
  const first = await runGuarded(
    {
      runner,
      program: 'pnpm',
      args: oxlintArgs(plan, true),
      cwd: path.dirname(plan.configPath),
      env,
      prerequisite: PNPM_PREREQUISITE,
      toolLabel: 'OXLINT',
    },
    true,
  )
  if (first !== 'retry-without-type-aware') {
    return first === 'ok' ? { exitCode: 0, stderr: '' } : first
  }
  const retry = await runGuarded(
    {
      runner,
      program: 'pnpm',
      args: oxlintArgs(plan, false),
      cwd: path.dirname(plan.configPath),
      env,
      prerequisite: PNPM_PREREQUISITE,
      toolLabel: 'OXLINT',
    },
    false,
  )
  return retry === 'ok' ? { exitCode: 0, stderr: '' } : retry
}

export const runLintGuard = async (
  raw: string,
  cwd: string,
  options: GuardOptions = { fs: realFs, runner: realRunner, envOverrides: {} },
): Promise<HookResult> => {
  const command = decodePayload(raw)
  if (command === undefined) {
    return { exitCode: 0, stderr: '' }
  }
  const rootOverride = PROJECT_ROOT_ENV in options.envOverrides
    ? options.envOverrides[PROJECT_ROOT_ENV]
    : await Deno.env.get(PROJECT_ROOT_ENV)
  const facts = await gather(options.fs, command.filePath, cwd, rootOverride)
  const plan = decidePlan(facts)
  switch (plan.tag) {
    case 'skip':
      return { exitCode: 0, stderr: '' }
    case 'run-deno':
      return await runDenoPair(options.runner, plan.filePath, snapshotEnv(options.envOverrides))
    case 'run-oxlint':
      return await runOxlint(options.runner, plan, snapshotEnv(options.envOverrides))
  }
}

if (import.meta.main) {
  const stdin = await readStdin()
  if (stdin.tag === 'too-large') {
    Deno.exit(0)
  }
  const result = await runLintGuard(stdin.content, Deno.cwd())
  if (result.stderr !== '') {
    console.error(result.stderr)
  }
  Deno.exit(result.exitCode)
}
