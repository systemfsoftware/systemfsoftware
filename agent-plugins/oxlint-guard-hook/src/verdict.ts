import { Match } from 'effect'
import type { FastCheck } from 'effect/testing'
import type { GuardVerdict, HookResult, LintVerdict, ProcessResult, RunOutcome } from './flow.schema.ts'

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
const TSGOLINT_MISSING =
  /failed to find tsgolint executable|tsgolint executable not found|cannot find (?:the )?tsgolint (?:executable|binary)/i
const OXLINT_NOT_FOUND = /ERR_PNPM|command .* not found/i

interface ClassifyRule {
  readonly matches: (
    combined: string,
    exitCode: number,
    canRetry: boolean,
  ) => boolean
  readonly outcome: LintVerdict
}

const PASS_VERDICT: LintVerdict = { _tag: 'Pass' }
const RETRY_VERDICT: LintVerdict = { _tag: 'RetryWithoutTypeCheck' }
const TOOL_MISSING_VERDICT: LintVerdict = { _tag: 'ToolMissing' }

const CLASSIFY_RULES: readonly ClassifyRule[] = [
  {
    matches: (_combined, exitCode) => exitCode === 0,
    outcome: PASS_VERDICT,
  },
  {
    matches: (combined) => NO_FILES_FOUND.test(combined),
    outcome: PASS_VERDICT,
  },
  {
    matches: (combined) => OXLINT_PANIC.test(combined) && PATH_OUTSIDE_ROOT.test(combined),
    outcome: PASS_VERDICT,
  },
  {
    matches: (combined, _exitCode, canRetry) => canRetry && TSGOLINT_MISSING.test(combined),
    outcome: RETRY_VERDICT,
  },
  {
    matches: (combined, exitCode) => exitCode !== 0 && OXLINT_NOT_FOUND.test(combined),
    outcome: TOOL_MISSING_VERDICT,
  },
]

const catchAllOutcome = (result: ProcessResult): LintVerdict => ({
  _tag: 'Violation',
  output: stderrOrStdout(result),
})

export const lintVerdict = (
  result: ProcessResult,
  canRetry: boolean,
): LintVerdict => {
  const combined = combinedOutput(result)
  const rule = CLASSIFY_RULES.find((candidate) => candidate.matches(combined, result.exitCode, canRetry))
  if (rule !== undefined) {
    return rule.outcome
  }
  return catchAllOutcome(result)
}

const MAX_OUTPUT_LINES = 30

const truncateOutput = (text: string): string => {
  const lines = text.split('\n', MAX_OUTPUT_LINES + 1)
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

const PROCEED: GuardVerdict = { _tag: 'Proceed' }
const RETRY: GuardVerdict = { _tag: 'Retry' }

const halt = (exitCode: 0 | 1 | 2, stderr: string): GuardVerdict => ({
  _tag: 'Halt',
  response: { exitCode, stderr },
})

export const PASS: HookResult = { exitCode: 0, stderr: '' }

export interface AttemptContext {
  readonly prerequisite: string
  readonly toolLabel: string
}

export const verdictOf = (
  attempt: RunOutcome,
  canRetry: boolean,
  context: AttemptContext,
): GuardVerdict =>
  Match.value(attempt).pipe(
    Match.tag('spawn-failure', ({ failure }) => halt(1, spawnUnavailableHint(failure.reason, context.prerequisite))),
    Match.tag('timeout', () => halt(0, '')),
    Match.tag('result', ({ result }) => {
      const lint = lintVerdict(result, canRetry)
      return Match.value(lint).pipe(
        Match.tag('Pass', () => PROCEED),
        Match.tag('RetryWithoutTypeCheck', () => RETRY),
        Match.tag('ToolMissing', () => halt(1, spawnUnavailableHint('not-found', context.prerequisite))),
        Match.tag('Violation', ({ output }) => halt(2, diagnostic(context.toolLabel, output))),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
  )

if (import.meta.vitest !== void 0) {
  // Dynamic imports by necessity: vitest sets import.meta.vitest only when
  // running in-source tests; a static import would drag vitest into the deno
  // hook runtime, which never enters this block.
  const { it } = await import('@effect/vitest')
  const fc: typeof FastCheck = (await import('effect/testing')).FastCheck

  const lintTagOf = (result: ProcessResult, canRetry: boolean): LintVerdict['_tag'] =>
    lintVerdict(result, canRetry)._tag

  const violationOutput = (result: ProcessResult): string | undefined =>
    Match.value(lintVerdict(result, true)).pipe(
      Match.tag('Violation', ({ output }) => output),
      Match.orElse(() => undefined),
    )

  // Constructive complement of the classify regexes: every trigger phrase
  // contains letters, so strings drawn from this letter-free alphabet can
  // never match one, and the violation branch is reached without filtering.
  const unmatchedArb = fc.stringMatching(/^[0-9\s./:=_-]{0,120}$/)

  it.prop(
    '∀r_ZeroExit_≡Pass',
    [
      fc.record({
        exitCode: fc.constant(0),
        stdout: fc.string({ maxLength: 120 }),
        stderr: fc.string({ maxLength: 120 }),
      }),
      fc.boolean(),
    ],
    ([result, canRetry]) => lintTagOf(result, canRetry) === 'Pass',
  )

  it.prop(
    '∀r_ForbiddenRetry_¬RetryWithoutTypeCheck',
    [fc.record({
      exitCode: fc.integer({ min: 1, max: 255 }),
      stdout: unmatchedArb,
      stderr: unmatchedArb,
    })],
    ([result]) => lintTagOf(result, false) !== 'RetryWithoutTypeCheck',
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
