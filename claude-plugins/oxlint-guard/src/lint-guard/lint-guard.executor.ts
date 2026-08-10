import * as Command from '@effect/platform/Command'
import * as Path from '@effect/platform/Path'
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { HookPayloadToEditCommand } from '../hook-payload.acl.js'
import { classifyLintResult, RetryWithoutTypeAware } from './lint-outcome.workflow.js'
import type { LintViolation } from './lint-outcome.workflow.js'
import { decideLintPlan } from './lint-plan.workflow.js'
import type { LintFailure, LintPlan } from './lint-plan.workflow.js'

export interface ProcessResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface GatheredFacts {
  readonly resolvedPath: string
  readonly exists: boolean
  readonly firstLine: Option.Option<string>
  readonly configPath: Option.Option<string>
  readonly oxlintBinary: Option.Option<string>
  readonly lockfile: Option.Option<string>
}

// A linter subprocess that could not be started at all (missing binary, no
// execute permission, a path that turned out to be a directory). This is a
// machine problem, never evidence of a lint violation: the adapter maps the
// underlying driver error here so the guard can say what is wrong instead of
// blocking every edit with a bogus "lint violations found".
export class SpawnFailure extends S.TaggedError<SpawnFailure>()('SpawnFailure', {
  program: S.String,
  reason: S.Literal('not-found', 'not-executable', 'unknown'),
  message: S.String,
}) {}

// The nearest oxlint candidate exists but can never run (it is a directory).
export class OxlintBinaryNotExecutable extends S.TaggedError<OxlintBinaryNotExecutable>()(
  'OxlintBinaryNotExecutable',
  { path: S.String },
) {}

export interface LintGuardAdapter {
  readonly gather: (filePath: string, cwd: string) => Effect.Effect<GatheredFacts, OxlintBinaryNotExecutable>
  readonly run: (command: Command.Command) => Effect.Effect<ProcessResult, SpawnFailure>
}

export const LintGuardAdapter = Context.GenericTag<LintGuardAdapter>('@oxlint-guard/LintGuardAdapter')

export interface HookResult {
  readonly exitCode: number
  readonly stderr: string
}

// Per-command budget for one linter invocation. Worst case inside the 120s
// hook cap: oxlint type-aware (30s) + its retry (30s), or deno check + lint
// (30s each), plus stdin and file gathering — comfortably under the cap while
// a cold type-aware backend still gets room on a large file.
export const LINT_COMMAND_TIMEOUT = Duration.seconds(30)

// Appended by the adapter when a drained stream exceeded its byte budget, so
// the reader of a block message knows the output was cut.
export const TRUNCATION_MARKER = '\n[output truncated at 65536 bytes; run the linter directly for full output]'

export interface LintGuardOptions {
  readonly commandTimeout: Duration.Duration
}

const ACCEPTED_CONFIG_NAMES =
  'oxlint.config.ts, oxlint.config.js, oxlint.config.mjs, oxlint.config.cjs, .oxlintrc.json, or oxlint.json'

const describeLintFailure = (failure: LintFailure): string =>
  Match.value(failure).pipe(
    Match.tag(
      'NoOxlintConfig',
      (failure) =>
        'oxlint-guard: no oxlint config found in any directory up from the edited file.\n' +
        `Add one of ${ACCEPTED_CONFIG_NAMES} at the project root, and install oxlint locally: ${failure.installHint}`,
    ),
    Match.tag(
      'NoOxlintBinary',
      (failure) =>
        'oxlint-guard: no local oxlint binary (node_modules/.bin/oxlint) found in any directory up from the edited file.\n' +
        `Install oxlint locally: ${failure.installHint}\n` +
        `Make sure an oxlint config (${ACCEPTED_CONFIG_NAMES}) exists at the project root.`,
    ),
    Match.exhaustive,
  )

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
    const value = process.env[key]
    if (value !== undefined) {
      env[key] = value
    }
  }
  return env
}

const describeBrokenBinary = (failure: OxlintBinaryNotExecutable): string =>
  `oxlint-guard: oxlint binary found at ${failure.path} but is not executable.\n` +
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

const buildOxlintCommand = (
  run: Extract<LintPlan, { _tag: 'RunOxlint' }>,
  cwd: string,
  typeAware: boolean,
): Command.Command => {
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
  const command = run.oxlintBinary.endsWith('.cmd')
    ? Command.make('cmd.exe', '/c', run.oxlintBinary, ...args)
    : Command.make(run.oxlintBinary, ...args)
  return Command.env(Command.workingDirectory(command, cwd), minimalEnv())
}

const runDeno = (
  adapter: LintGuardAdapter,
  path: Path.Path,
  filePath: string,
  timeout: Duration.Duration,
): Effect.Effect<HookResult, never> =>
  Effect.gen(function*() {
    const cwd = path.dirname(filePath)
    const env = minimalEnv()
    const checkAttempt = yield* Effect.either(
      Effect.timeoutOption(
        adapter.run(
          Command.env(Command.make('deno', 'check', '--', filePath).pipe(Command.workingDirectory(cwd)), env),
        ),
        timeout,
      ),
    )
    if (Either.isLeft(checkAttempt)) {
      return block(describeDenoSpawnFailure(checkAttempt.left))
    }
    if (Option.isNone(checkAttempt.right)) {
      // A hung check is not evidence of a lint failure — never block on it.
      return allow()
    }
    const check = checkAttempt.right.value
    if (check.exitCode !== 0) {
      return block(`oxlint-guard: deno check failed for ${filePath}:\n${stderrOrStdout(check)}`)
    }
    const lintAttempt = yield* Effect.either(
      Effect.timeoutOption(
        adapter.run(
          Command.env(Command.make('deno', 'lint', '--', filePath).pipe(Command.workingDirectory(cwd)), env),
        ),
        timeout,
      ),
    )
    if (Either.isLeft(lintAttempt)) {
      return block(describeDenoSpawnFailure(lintAttempt.left))
    }
    if (Option.isNone(lintAttempt.right)) {
      // A hung lint pass is not evidence of a lint failure — never block on it.
      return allow()
    }
    const lint = lintAttempt.right.value
    if (lint.exitCode !== 0) {
      return block(`oxlint-guard: deno lint failed for ${filePath}:\n${stderrOrStdout(lint)}`)
    }
    return allow()
  })

const runOxlint = (
  adapter: LintGuardAdapter,
  path: Path.Path,
  run: Extract<LintPlan, { _tag: 'RunOxlint' }>,
  timeout: Duration.Duration,
): Effect.Effect<HookResult, never> =>
  Effect.gen(function*() {
    const cwd = path.dirname(run.configPath)

    const firstAttempt = yield* Effect.either(
      Effect.timeoutOption(adapter.run(buildOxlintCommand(run, cwd, true)), timeout),
    )
    if (Either.isLeft(firstAttempt)) {
      // A binary that cannot be spawned will not start on retry either — say
      // what is wrong instead of retrying or reporting a bogus violation.
      return block(describeOxlintSpawnFailure(run.oxlintBinary, firstAttempt.left))
    }
    if (Option.isSome(firstAttempt.right)) {
      const firstVerdict = classifyLintResult({ result: firstAttempt.right.value, canRetry: true })
      if (Either.isLeft(firstVerdict)) {
        return block(describeLintViolation(firstVerdict.left, { typeAware: true }))
      }
      if (!S.is(RetryWithoutTypeAware)(firstVerdict.right)) {
        return allow()
      }
    }
    // The type-aware pass timed out or its backend is unavailable — retry
    // without type information rather than losing the result entirely.
    const retryAttempt = yield* Effect.either(
      Effect.timeoutOption(adapter.run(buildOxlintCommand(run, cwd, false)), timeout),
    )
    if (Either.isLeft(retryAttempt)) {
      return block(describeOxlintSpawnFailure(run.oxlintBinary, retryAttempt.left))
    }
    if (Option.isNone(retryAttempt.right)) {
      // A timeout is not evidence of a lint failure — never fabricate a block.
      return allow()
    }
    const retryVerdict = classifyLintResult({ result: retryAttempt.right.value, canRetry: false })
    if (Either.isLeft(retryVerdict)) {
      return block(describeLintViolation(retryVerdict.left, { typeAware: false }))
    }
    return allow()
  })

const executePlan = (
  adapter: LintGuardAdapter,
  path: Path.Path,
  plan: LintPlan,
  timeout: Duration.Duration,
): Effect.Effect<HookResult, never> =>
  Match.value(plan).pipe(
    Match.tag('Skip', () => Effect.succeed(allow())),
    Match.tag('RunDeno', ({ filePath }) => runDeno(adapter, path, filePath, timeout)),
    Match.tag('RunOxlint', (run) => runOxlint(adapter, path, run, timeout)),
    Match.exhaustive,
  )

const settlePlan = (
  adapter: LintGuardAdapter,
  path: Path.Path,
  plan: Either.Either<LintPlan, LintFailure>,
  timeout: Duration.Duration,
): Effect.Effect<HookResult, never> =>
  Either.match(plan, {
    onLeft: (failure) => Effect.succeed(block(describeLintFailure(failure))),
    onRight: (decision) => executePlan(adapter, path, decision, timeout),
  })

const decodeEdit = S.decodeUnknownEither(S.parseJson(HookPayloadToEditCommand))

export const runLintGuard = (
  raw: string,
  cwd: string = process.cwd(),
  options: LintGuardOptions = { commandTimeout: LINT_COMMAND_TIMEOUT },
): Effect.Effect<HookResult, never, LintGuardAdapter | Path.Path> =>
  Effect.catchTag(
    Effect.gen(function*() {
      const decoded = decodeEdit(raw)
      if (Either.isLeft(decoded)) {
        return allow()
      }
      const adapter = yield* LintGuardAdapter
      const path = yield* Path.Path
      const facts = yield* adapter.gather(decoded.right.filePath, cwd)
      const plan = decideLintPlan({
        toolName: decoded.right.toolName,
        resolvedPath: facts.resolvedPath,
        extension: path.extname(facts.resolvedPath).slice(1),
        exists: facts.exists,
        firstLine: facts.firstLine,
        configPath: facts.configPath,
        oxlintBinary: facts.oxlintBinary,
        lockfile: facts.lockfile,
      })
      return yield* settlePlan(adapter, path, plan, options.commandTimeout)
    }),
    'OxlintBinaryNotExecutable',
    (failure) => Effect.succeed(block(describeBrokenBinary(failure))),
  )
