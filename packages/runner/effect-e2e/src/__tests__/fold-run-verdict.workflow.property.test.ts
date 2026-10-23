import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { runVerdictOf } from '../verdict/exit-code.js'
import type { FailureCode } from '../verdict/failure.schema.js'
import { FoldRunVerdict, foldRunVerdict } from '../verdict/fold-run-verdict.workflow.js'
import { RunVerdict } from '../verdict/run-verdict.schema.js'

// Design §10: a failure code is blockable exactly when its default cause is environment.
const BLOCKABLE: { readonly [Code in FailureCode]: boolean } = {
  MODEL_UNAVAILABLE: true,
  MODEL_PROVIDER_FAILED: true,
  MODEL_REFUSED: true,
  AUTH_CREDENTIAL_UNAVAILABLE: true,
  AUTH_CREDENTIAL_INVALID: true,
  SECRET_UNAVAILABLE: true,
  ENVIRONMENT_UNAVAILABLE: true,
  APP_UNREACHABLE: true,
  APP_NOT_OPEN: true,
  ARTIFACT_WRITE_FAILED: true,
  LOCATOR_NOT_FOUND: false,
  LOCATOR_AMBIGUOUS: false,
  ACTION_FAILED: false,
  AUTOMATION_UNSUPPORTED: false,
  UNSUPPORTED_CAPABILITY: false,
  STEP_BUDGET_EXHAUSTED: false,
  STEP_TIMEOUT: false,
  STEP_NO_CONCLUSION: false,
  STEP_NOT_AWAITED: false,
  REPLAY_STALE: false,
  POLICY_DENIED: false,
  CONTEXT_OVERFLOW: false,
  MODEL_OUTPUT_INVALID: false,
  ASSERTION_INCONCLUSIVE: false,
  ASSERTION_FAILED: false,
  INTERRUPTED: false,
  INTERNAL_ERROR: false,
}

// FR-5 exit table.
const EXIT_OF_STATUS = { passed: 0, failed: 1, blocked: 3, error: 4, interrupted: 130 } as const

type Status = keyof typeof EXIT_OF_STATUS

const verdictOf = (command: FoldRunVerdict): RunVerdict | undefined =>
  Result.match(foldRunVerdict(command), { onFailure: () => undefined, onSuccess: runVerdictOf })

// Design §10 precedence: interruption, then internal error, then any non-blockable failure, then only blockable failures.
const design10StatusOf = (command: FoldRunVerdict): Status => {
  const codes = [
    ...command.steps.flatMap((step) => 'code' in step.outcome ? [step.outcome.code] : []),
    ...command.runErrors.map((error) => error.code),
  ]
  return codes.includes('INTERRUPTED')
    ? 'interrupted'
    : codes.includes('INTERNAL_ERROR')
    ? 'error'
    : codes.length === 0
    ? 'passed'
    : codes.every((code) => BLOCKABLE[code])
    ? 'blocked'
    : 'failed'
}

const nonPassingCountOf = (command: FoldRunVerdict): number =>
  command.steps.filter((step) => 'code' in step.outcome).length + command.runErrors.length

// Each drawn record carries an arbitrary recorded cause and model-proposed cause, so the verdict matching the
// code-only oracle is also the law that neither cause moves the status or the exit code.
it.prop(
  '∀c_FoldRunVerdict_≡Design10StatusAndExit',
  {
    of: [FoldRunVerdict],
    subject: verdictOf,
    runs: 500,
    arbitrary: { seed: 499_101 },
    cover: {
      passed: [(command: FoldRunVerdict) => design10StatusOf(command) === 'passed', 0.03],
      failed: [(command: FoldRunVerdict) => design10StatusOf(command) === 'failed', 0.3],
      blocked: [(command: FoldRunVerdict) => design10StatusOf(command) === 'blocked', 0.02],
      error: [(command: FoldRunVerdict) => design10StatusOf(command) === 'error', 0.1],
      interrupted: [(command: FoldRunVerdict) => design10StatusOf(command) === 'interrupted', 0.1],
    },
  },
  (subject, [command]) => {
    const status = design10StatusOf(command)
    const verdict = subject(command)
    return verdict !== undefined && Schema.is(RunVerdict)(verdict) && verdict.status === status &&
      verdict.exitCode === EXIT_OF_STATUS[status] && verdict.failures.length === nonPassingCountOf(command)
  },
)

it.prop(
  '∀c_FoldRunVerdict_≡SameVerdictRepeatedAndReordered',
  { of: [FoldRunVerdict, Schema.Int], subject: verdictOf, runs: 200, arbitrary: { seed: 499_102 } },
  (subject, [command, shift]) => {
    const first = subject(command)
    const again = subject(command)
    const reordered = subject(
      new FoldRunVerdict({
        steps: Arr.reverse(Arr.rotate(command.steps, shift)),
        runErrors: Arr.reverse(Arr.rotate(command.runErrors, shift)),
      }),
    )
    return first !== undefined && again !== undefined && reordered !== undefined &&
      first.status === again.status && first.exitCode === again.exitCode &&
      first.status === reordered.status && first.exitCode === reordered.exitCode
  },
)
