import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { Cause } from '../verdict/cause.schema.js'
import { runVerdictOf } from '../verdict/exit-code.js'
import type { FailureCode } from '../verdict/failure.schema.js'
import { FoldRunVerdict, foldRunVerdict } from '../verdict/fold-run-verdict.workflow.js'
import { RunVerdict } from '../verdict/run-verdict.schema.js'

const DESIGN_10_CAUSE: { readonly [Code in FailureCode]: Cause } = {
  MODEL_UNAVAILABLE: 'environment',
  MODEL_PROVIDER_FAILED: 'environment',
  MODEL_REFUSED: 'environment',
  AUTH_CREDENTIAL_UNAVAILABLE: 'environment',
  AUTH_CREDENTIAL_INVALID: 'environment',
  SECRET_UNAVAILABLE: 'environment',
  ENVIRONMENT_UNAVAILABLE: 'environment',
  APP_UNREACHABLE: 'environment',
  APP_NOT_OPEN: 'environment',
  ARTIFACT_WRITE_FAILED: 'environment',
  LOCATOR_NOT_FOUND: 'automation',
  LOCATOR_AMBIGUOUS: 'automation',
  ACTION_FAILED: 'automation',
  AUTOMATION_UNSUPPORTED: 'automation',
  UNSUPPORTED_CAPABILITY: 'automation',
  STEP_BUDGET_EXHAUSTED: 'automation',
  STEP_TIMEOUT: 'automation',
  STEP_NO_CONCLUSION: 'automation',
  STEP_NOT_AWAITED: 'automation',
  REPLAY_STALE: 'automation',
  POLICY_DENIED: 'automation',
  CONTEXT_OVERFLOW: 'automation',
  MODEL_OUTPUT_INVALID: 'automation',
  ASSERTION_INCONCLUSIVE: 'automation',
  ASSERTION_FAILED: 'product',
  INTERRUPTED: 'unclassified',
  INTERNAL_ERROR: 'unclassified',
}

const EXIT_OF_STATUS = { passed: 0, failed: 1, blocked: 3, error: 4, interrupted: 130 } as const

type Status = keyof typeof EXIT_OF_STATUS

const verdictOf = (command: FoldRunVerdict): RunVerdict | undefined =>
  Result.match(foldRunVerdict(command), { onFailure: () => undefined, onSuccess: runVerdictOf })

const recordedCodesOf = (command: FoldRunVerdict): ReadonlyArray<FailureCode> => [
  ...command.steps.flatMap((step) => 'code' in step.outcome ? [step.outcome.code] : []),
  ...command.runErrors.map((error) => error.code),
]

const design10StatusOf = (command: FoldRunVerdict): Status => {
  const codes = recordedCodesOf(command)
  return codes.includes('INTERRUPTED')
    ? 'interrupted'
    : codes.includes('INTERNAL_ERROR')
    ? 'error'
    : codes.length === 0
    ? 'passed'
    : codes.every((code) => DESIGN_10_CAUSE[code] === 'environment')
    ? 'blocked'
    : 'failed'
}

it.prop(
  '∀c_FoldRunVerdict_≡Design10StatusExitAndCauses',
  {
    of: [FoldRunVerdict],
    subject: verdictOf,
    runs: 500,
    arbitrary: { seed: 499_101 },
  },
  (subject, [command]) => {
    const status = design10StatusOf(command)
    const codes = recordedCodesOf(command)
    const verdict = subject(command)
    return verdict !== undefined && Schema.is(RunVerdict)(verdict) && verdict.status === status &&
      verdict.exitCode === EXIT_OF_STATUS[status] && verdict.failures.length === codes.length &&
      verdict.failures.every((failure, index) =>
        failure.code === codes[index] && failure.cause === DESIGN_10_CAUSE[failure.code] &&
        (failure.proposed === undefined || failure.proposed.evidence.length > 0 ||
          failure.proposed.cause === 'unclassified')
      )
  },
)

it.prop(
  '∀c_FoldRunVerdict_≡SameStatusAndExitRepeatedAndReordered',
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
