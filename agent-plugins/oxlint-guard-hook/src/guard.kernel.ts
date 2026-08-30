import { Effect, Match, Option } from 'effect'
import * as Result from 'effect/Result'
import type { FastCheck } from 'effect/testing'
import { COMMAND_BUDGET_MS, DENO_PREREQUISITE, PNPM_PREREQUISITE } from './constants.ts'
import type { AttemptOutcome, FinalAttempt, HookResult, LintOutcome, ProcessResult, RunOutcome } from './flow.schema.ts'
import type { GuardDecision, GuardUnsupportedToolError, Runner } from './guard.workflow.ts'

interface GuardRun {
  readonly runner: Runner
  readonly program: string
  readonly args: string[]
  readonly cwd: string
  readonly prerequisite: string
  readonly toolLabel: string
}

const NO_FILES_FOUND = /No files found to lint/i
const PATH_OUTSIDE_ROOT = /path is expected to be under the root/i
const OXLINT_PANIC = /panicked at/
const TSGOLINT_MISSING = /tsgolint/i
const OXLINT_NOT_FOUND = /ERR_PNPM|command .* not found/i

const combinedOutput = (result: ProcessResult): string => result.stdout + '\n' + result.stderr

const stderrOrStdout = (result: ProcessResult): string => {
  if (result.stderr !== '') {
    return result.stderr
  }
  return result.stdout
}

interface ClassifyRule {
  readonly matches: (
    combined: string,
    exitCode: number,
    canRetry: boolean,
  ) => boolean
  readonly outcome: (result: ProcessResult) => LintOutcome
}

const CLASSIFY_RULES: readonly ClassifyRule[] = [
  {
    matches: (_combined, exitCode) => exitCode === 0,
    outcome: () => ({ _tag: 'outcome' }),
  },
  {
    matches: (combined) => NO_FILES_FOUND.test(combined),
    outcome: () => ({ _tag: 'outcome' }),
  },
  {
    matches: (combined) => OXLINT_PANIC.test(combined) && PATH_OUTSIDE_ROOT.test(combined),
    outcome: () => ({ _tag: 'outcome' }),
  },
  {
    matches: (combined, _exitCode, canRetry) => canRetry && TSGOLINT_MISSING.test(combined),
    outcome: () => ({ _tag: 'retry-without-type-aware' }),
  },
  {
    matches: (combined, exitCode) => exitCode !== 0 && OXLINT_NOT_FOUND.test(combined),
    outcome: () => ({ _tag: 'not-found' }),
  },
]

const catchAllOutcome = (result: ProcessResult): LintOutcome => ({
  _tag: 'violation',
  output: stderrOrStdout(result),
})

const classifyResult = (
  result: ProcessResult,
  canRetry: boolean,
): LintOutcome => {
  const combined = combinedOutput(result)
  const rule = CLASSIFY_RULES.find((candidate) => candidate.matches(combined, result.exitCode, canRetry))
  if (rule !== undefined) {
    return rule.outcome(result)
  }
  return catchAllOutcome(result)
}

const MAX_OUTPUT_LINES = 30

const truncateOutput = (text: string): string => {
  const lines = text.split('\n')
  if (lines.length <= MAX_OUTPUT_LINES) {
    return text
  }
  return `${lines.slice(0, MAX_OUTPUT_LINES).join('\n')}\n... [truncated — run the linter manually for full output]`
}

const diagnostic = (tool: string, output: string): string =>
  `⛔ ${tool} FAILED — INVOKE SKILLS FIRST.

You decide which — the hook will not map rules to skills for you.
Already-invoked skills do NOT count. Each failure demands NEW invocations.

--- ${tool} output ---
${truncateOutput(output)}

Find skills for the ROOT CAUSE above. Invoke them, THEN fix.`

const REASON_PHRASES: Record<string, string> = {
  'not-found': 'not found',
  'not-executable': 'not executable',
  unknown: 'spawn failed',
}

const spawnUnavailableHint = (missing: string, prerequisite: string): string =>
  `oxlint-guard-hook: ${prerequisite} could not be run (${
    REASON_PHRASES[missing] ?? 'spawn failed'
  }) - the lint guard cannot check this file. Install the prerequisite per the plugin README and retry.`

const PROCEED: AttemptOutcome = { _tag: 'proceed' }
const RETRY: AttemptOutcome = { _tag: 'retry-plain' }

const respond = (exitCode: 0 | 1 | 2, stderr: string): AttemptOutcome => ({
  _tag: 'respond',
  result: { exitCode, stderr },
})

const PASS: HookResult = { exitCode: 0, stderr: '' }

function attemptOutcome(
  attempt: RunOutcome,
  canRetry: boolean,
  run: GuardRun,
): AttemptOutcome {
  return Match.value(attempt).pipe(
    Match.tag(
      'spawn-failure',
      ({ failure }) => respond(1, spawnUnavailableHint(failure.reason, run.prerequisite)),
    ),
    Match.tag('timeout', () => respond(0, '')),
    Match.tag('result', ({ result }) => {
      const verdict = classifyResult(result, canRetry)
      return Match.value(verdict).pipe(
        Match.tag('outcome', () => PROCEED),
        Match.tag('retry-without-type-aware', () => RETRY),
        Match.tag(
          'not-found',
          () => respond(1, spawnUnavailableHint('not-found', run.prerequisite)),
        ),
        Match.tag(
          'violation',
          ({ output }) => respond(2, diagnostic(run.toolLabel, output)),
        ),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
  )
}

function runGuarded(
  run: GuardRun,
  canRetry: true,
): Effect.Effect<AttemptOutcome, never, never>
function runGuarded(
  run: GuardRun,
  canRetry: false,
): Effect.Effect<FinalAttempt, never, never>
function runGuarded(
  run: GuardRun,
  canRetry: boolean,
): Effect.Effect<AttemptOutcome, never, never> {
  return Effect.map(
    run.runner.run(run.program, run.args, run.cwd, COMMAND_BUDGET_MS),
    (attempt) => attemptOutcome(attempt, canRetry, run),
  )
}

const haltOf = (attempt: FinalAttempt): Option.Option<HookResult> =>
  Match.value(attempt).pipe(
    Match.tag('proceed', () => Option.none()),
    Match.tag('respond', ({ result }) => Option.some(result)),
    Match.exhaustive,
  )

const runDenoPair = (
  runner: Runner,
  dirname: (target: string) => string,
  filePath: string,
): Effect.Effect<HookResult, never, never> =>
  Effect.gen(function*() {
    const step = (command: 'check' | 'lint'): GuardRun => ({
      runner,
      program: 'deno',
      args: [command, '--', filePath],
      cwd: dirname(filePath),
      prerequisite: DENO_PREREQUISITE,
      toolLabel: `DENO ${command.toUpperCase()}`,
    })
    const halted = haltOf(yield* runGuarded(step('check'), false))
    if (Option.isSome(halted)) {
      return halted.value
    }
    return Option.getOrElse(
      haltOf(yield* runGuarded(step('lint'), false)),
      () => PASS,
    )
  })

const oxlintArgs = (
  plan: { readonly filePath: string; readonly configPath: string },
  typeAware: boolean,
): string[] => {
  if (typeAware) {
    return [
      'exec',
      'oxlint',
      '-c',
      plan.configPath,
      '--type-aware',
      '--type-check',
      '-f',
      'unix',
      plan.filePath,
    ]
  }
  return ['exec', 'oxlint', '-c', plan.configPath, '-f', 'unix', plan.filePath]
}

const runOxlint = (
  runner: Runner,
  dirname: (target: string) => string,
  plan: { readonly filePath: string; readonly configPath: string },
): Effect.Effect<HookResult, never, never> =>
  Effect.gen(function*() {
    const step = (typeAware: boolean): GuardRun => ({
      runner,
      program: 'pnpm',
      args: oxlintArgs(plan, typeAware),
      cwd: dirname(plan.configPath),
      prerequisite: PNPM_PREREQUISITE,
      toolLabel: 'OXLINT',
    })
    const settled = Match.value(yield* runGuarded(step(true), true)).pipe(
      Match.tag('proceed', () => Option.some(PASS)),
      Match.tag('retry-plain', () => Option.none()),
      Match.tag('respond', ({ result }) => Option.some(result)),
      Match.exhaustive,
    )
    if (Option.isSome(settled)) {
      return settled.value
    }
    return Option.getOrElse(haltOf(yield* runGuarded(step(false), false)), () => PASS)
  })

export const executeDecision = (
  outcome: Result.Result<GuardDecision, GuardUnsupportedToolError>,
  runner: Runner,
  dirname: (target: string) => string,
): Effect.Effect<HookResult, never, never> =>
  Result.match(outcome, {
    onFailure: () => Effect.succeed<HookResult>({ exitCode: 0, stderr: '' }),
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag(
          'Skip',
          () => Effect.succeed<HookResult>({ exitCode: 0, stderr: '' }),
        ),
        Match.tag(
          'RunDeno',
          ({ filePath }) => runDenoPair(runner, dirname, filePath),
        ),
        Match.tag(
          'RunOxlint',
          ({ filePath, configPath }) => runOxlint(runner, dirname, { filePath, configPath }),
        ),
        Match.exhaustive,
      ),
  })

if (import.meta.vitest !== void 0) {
  // Dynamic imports by necessity: vitest sets import.meta.vitest only when
  // running in-source tests; a static import would drag vitest into the deno
  // hook runtime, which never enters this block.
  const { it } = await import('@effect/vitest')
  const fc: typeof FastCheck = (await import('effect/testing')).FastCheck
  const outcomeTag = (result: ProcessResult, canRetry: boolean): string => {
    const verdict = classifyResult(result, canRetry)
    let tag = ''
    Match.value(verdict).pipe(
      Match.tag('outcome', () => {
        tag = 'outcome'
      }),
      Match.tag('retry-without-type-aware', () => {
        tag = 'retry-without-type-aware'
      }),
      Match.tag('not-found', () => {
        tag = 'not-found'
      }),
      Match.tag('violation', () => {
        tag = 'violation'
      }),
      Match.exhaustive,
    )
    return tag
  }

  const violationOutput = (result: ProcessResult): string | undefined => {
    const verdict = classifyResult(result, true)
    let output: string | undefined
    Match.value(verdict).pipe(
      Match.tag('violation', ({ output: value }) => {
        output = value
      }),
      Match.orElse(() => {}),
    )
    return output
  }

  // Constructive complement of the classify regexes: every trigger phrase
  // contains letters, so strings drawn from this letter-free alphabet can
  // never match one, and the violation branch is reached without filtering.
  const unmatchedArb = fc.stringMatching(/^[0-9\s./:=_-]{0,120}$/)

  it.prop(
    '∀r_ZeroExit_≡Outcome',
    [
      fc.record({
        exitCode: fc.constant(0),
        stdout: fc.string({ maxLength: 120 }),
        stderr: fc.string({ maxLength: 120 }),
      }),
      fc.boolean(),
    ],
    ([result, canRetry]) => outcomeTag(result, canRetry) === 'outcome',
  )

  it.prop(
    '∀r_ForbiddenRetry_¬RetryOutcome',
    [fc.record({
      exitCode: fc.integer({ min: 1, max: 255 }),
      stdout: unmatchedArb,
      stderr: unmatchedArb,
    })],
    ([result]) => outcomeTag(result, false) !== 'retry-without-type-aware',
  )

  it.prop(
    '∀r_UnmatchedNonZero_≡ViolationWithStderr',
    [fc.record({
      exitCode: fc.integer({ min: 1, max: 255 }),
      stdout: unmatchedArb,
      stderr: unmatchedArb,
    })],
    ([result]) => {
      const output = violationOutput(result)
      return output !== undefined && output === stderrOrStdout(result)
    },
  )

  const multilineArb = fc.array(fc.stringMatching(/^[^\n]{0,20}$/), {
    maxLength: 80,
  }).map((lines) => lines.join('\n'))

  it.prop(
    '∀t_Truncated_⊆Original',
    [multilineArb],
    ([text]) => {
      const truncated = truncateOutput(text)
      const prefix = truncated.split('\n... [truncated')[0] ?? ''
      return truncated.split('\n').length <= 30 && text.startsWith(prefix)
    },
  )

  it.prop(
    '∀t_TruncateTwice_≡TruncateOnce',
    [multilineArb],
    ([text]) => {
      const once = truncateOutput(text)
      return truncateOutput(once) === once
    },
  )
}
