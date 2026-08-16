import { Effect, Schema as S } from 'effect'

/**
 * The syntactic McCabe ceiling a non-make, non-test function may reach.
 *
 * Measured across the workspace on 2026-08-16 with the rule at max: 0 so
 * every branchable function reports (36 packages, 1441 distinct functions):
 * the maximum per-function cyclomatic complexity outside `Workflow.make`
 * bodies and test files is 17. The ceiling is that measured value — the
 * lowest ceiling the entire tree passes at error severity with zero waivers
 * and zero suppressions. It is a creation-forcer for NEW branching, not a
 * retrofit demand on the incumbent functions below it; the functions at
 * 11–17 are the recorded extraction backlog.
 */
export const DEFAULT_MAX_COMPLEXITY = 17

/** Test files exercise decisions as fixtures; the regime binds production code. */
export const TEST_FILE_PATTERN = /\.(test|spec|property\.test|tst)\.[cm]?tsx?$/u

export const isTestFile = (filename: string): boolean => TEST_FILE_PATTERN.test(filename)

export const Options = S.Struct({
  max: S.Finite.pipe(
    S.withDecodingDefaultType(Effect.succeed(DEFAULT_MAX_COMPLEXITY)),
  ),
})

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Bans functions whose syntactic cyclomatic complexity exceeds the ceiling. Decision points (if, case, &&, ||, ternary, for, for-in, for-of, while, do, catch) outside a Workflow.make body have no legal home except extraction into smaller functions.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    maxComplexity: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
