import { Match, Option } from 'effect'
import type { FastCheck } from 'effect/testing'
import type { AttemptOutcome, FinalAttempt, HookResult, LintOutcome, ProcessResult, RunOutcome } from './flow.schema.ts'

const combinedOutput = (result: ProcessResult): string => result.stdout + '\n' + result.stderr

const stderrOrStdout = (result: ProcessResult): string => {
  if (result.stderr.trim() !== '') {
    return result.stderr
  }
  return result.stdout
}

const NO_FILES_FOUND = /No files found to lint/i
const PATH_OUTSIDE_ROOT = /path is expected to be under the root/i
const OXLINT_PANIC = /panicked at/
const TSGOLINT_MISSING = /tsgolint/i
const OXLINT_NOT_FOUND = /ERR_PNPM|command .* not found/i

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

export const classifyResult = (
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

Before fixing anything below, invoke skills that address why these rules fire.
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

export const PASS: HookResult = { exitCode: 0, stderr: '' }

export interface AttemptContext {
  readonly prerequisite: string
  readonly toolLabel: string
}

export const attemptOutcome = (
  attempt: RunOutcome,
  canRetry: boolean,
  context: AttemptContext,
): AttemptOutcome =>
  Match.value(attempt).pipe(
    Match.tag('spawn-failure', ({ failure }) => respond(1, spawnUnavailableHint(failure.reason, context.prerequisite))),
    Match.tag('timeout', () => respond(0, '')),
    Match.tag('result', ({ result }) => {
      const verdict = classifyResult(result, canRetry)
      return Match.value(verdict).pipe(
        Match.tag('outcome', () => PROCEED),
        Match.tag('retry-without-type-aware', () => RETRY),
        Match.tag('not-found', () => respond(1, spawnUnavailableHint('not-found', context.prerequisite))),
        Match.tag('violation', ({ output }) => respond(2, diagnostic(context.toolLabel, output))),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
  )

export const haltOf = (attempt: FinalAttempt): Option.Option<HookResult> =>
  Match.value(attempt).pipe(
    Match.tag('proceed', () => Option.none()),
    Match.tag('respond', ({ result }) => Option.some(result)),
    Match.exhaustive,
  )

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
