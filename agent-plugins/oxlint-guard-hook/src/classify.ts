import type { ProcessResult, SpawnFailureReason } from './facts.ts'

export const NO_FILES_FOUND = /No files found to lint/i
export const PATH_OUTSIDE_ROOT = /path is expected to be under the root/i
export const OXLINT_PANIC = /panicked at/
export const TSGOLINT_MISSING = /tsgolint/i
export const OXLINT_NOT_FOUND = /ERR_PNPM|command .* not found/i

export type LintOutcome =
  | { readonly _tag: 'outcome' }
  | { readonly _tag: 'retry-without-type-aware' }
  | { readonly _tag: 'not-found' }
  | { readonly _tag: 'violation'; readonly output: string }

export const combinedOutput = (result: ProcessResult): string => result.stdout + '\n' + result.stderr

export const stderrOrStdout = (result: ProcessResult): string => (result.stderr !== '' ? result.stderr : result.stdout)

interface ClassifyRule {
  readonly matches: (combined: string, exitCode: number, canRetry: boolean) => boolean
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
  {
    matches: () => true,
    outcome: (result) => ({ _tag: 'violation', output: stderrOrStdout(result) }),
  },
]

export const classifyResult = (result: ProcessResult, canRetry: boolean): LintOutcome => {
  const combined = combinedOutput(result)
  return (
    CLASSIFY_RULES.find((rule) => rule.matches(combined, result.exitCode, canRetry))?.outcome(result) ??
      CLASSIFY_RULES.at(-1)!.outcome(result)
  )
}

export const MAX_OUTPUT_LINES = 30

export const truncateOutput = (text: string): string => {
  let cut = text.indexOf('\n')
  for (let line = 1; line < MAX_OUTPUT_LINES && cut !== -1; line++) {
    cut = text.indexOf('\n', cut + 1)
  }
  if (cut === -1) {
    return text
  }
  return text.slice(0, cut) + '\n... [truncated — run the linter manually for full output]'
}

export const diagnostic = (tool: string, output: string): string =>
  `⛔ ${tool} FAILED — INVOKE SKILLS FIRST.

Before fixing anything below, invoke skills that address why these rules fire.
You decide which — the hook will not map rules to skills for you.
Already-invoked skills do NOT count. Each failure demands NEW invocations.

--- ${tool} output ---
${truncateOutput(output)}

Find skills for the ROOT CAUSE above. Invoke them, THEN fix.`

export const DENO_PREREQUISITE = 'deno (https://deno.land)'
export const PNPM_PREREQUISITE = 'pnpm with oxlint as a dev dependency (pnpm add -D oxlint)'

export const REASON_PHRASES: Record<SpawnFailureReason, string> = {
  'not-found': 'not found',
  'not-executable': 'not executable',
  unknown: 'spawn failed',
}
export const spawnUnavailableHint = (missing: SpawnFailureReason, prerequisite: string): string =>
  `oxlint-guard-hook: ${prerequisite} could not be run (${
    REASON_PHRASES[missing]
  }) - the lint guard cannot check this file. Install the prerequisite per the plugin README and retry.`
