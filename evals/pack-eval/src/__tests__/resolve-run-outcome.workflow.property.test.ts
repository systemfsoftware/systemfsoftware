import { it } from '@effect/vitest'
import { Equal, Match, Result, Schema } from 'effect'
import type { ContradictionState, ResolveRunOutcomeDecision } from '../resolve-run-outcome.workflow.js'
import {
  ContradictionState as ContradictionStateSchema,
  ContradictionUnvalidated,
  resolveRunOutcome,
  ResolveRunOutcomeCommand,
  RunCleanUnderRefusedValidity,
  RunCleanUnderUnvalidatedJudge,
  RunCleanUnderValidatedJudge,
  RunFailedOnWitnessedContradiction,
  RunFault as RunFaultSchema,
  RunNotYetEvaluated,
} from '../resolve-run-outcome.workflow.js'

/** The outcome table of the High-Level Technical Design, written out independently. */
const rowOf = (state: ContradictionState): ResolveRunOutcomeDecision =>
  Match.value(state).pipe(
    Match.tag('ContradictionNotEvaluated', () => new RunNotYetEvaluated({ outcome: 0 })),
    Match.tag(
      'ContradictionValidated',
      (validated) =>
        validated.witnessedFailures > 0
          ? new RunFailedOnWitnessedContradiction({ outcome: 1, witnessedFailures: validated.witnessedFailures })
          : new RunCleanUnderValidatedJudge({ outcome: 0 }),
    ),
    Match.tag('ContradictionUnvalidated', () => new RunCleanUnderUnvalidatedJudge({ outcome: 0 })),
    Match.tag('ContradictionValidityRefused', () => new RunCleanUnderRefusedValidity({ outcome: 0 })),
    Match.exhaustive,
  )

const decisionOf = (command: ResolveRunOutcomeCommand): ResolveRunOutcomeDecision =>
  Result.getOrThrow(resolveRunOutcome(command))
it.prop(
  '∀s_contradictionState_≡OutcomeTableRow',
  [ContradictionStateSchema],
  ([state]) => {
    const command = new ResolveRunOutcomeCommand({ contradiction: state })
    return Equal.equals(decisionOf(command), rowOf(state))
  },
)

it.prop(
  '∀s_anyFault_≡RefusedCarryingTheFault',
  [ContradictionStateSchema, RunFaultSchema],
  ([state, fault]) => {
    const command = new ResolveRunOutcomeCommand({ contradiction: state, fault })
    return Match.value(decisionOf(command)).pipe(
      Match.tag('RunRefused', (refused) => Equal.equals(refused.fault, fault)),
      Match.tag('RunNotYetEvaluated', () => false),
      Match.tag('RunFailedOnWitnessedContradiction', () => false),
      Match.tag('RunCleanUnderValidatedJudge', () => false),
      Match.tag('RunCleanUnderUnvalidatedJudge', () => false),
      Match.tag('RunCleanUnderRefusedValidity', () => false),
      Match.exhaustive,
    )
  },
)

it.prop(
  '∀s_unvalidatedJudgeWithWitnessedFails_≡AdvisoryNeverFailsTheRun',
  [Schema.Int],
  ([failuresDraw]) => {
    const witnessedFailures = 1 + Math.abs(failuresDraw)
    const command = new ResolveRunOutcomeCommand({
      contradiction: new ContradictionUnvalidated({ witnessedFailures }),
    })
    return Equal.equals(decisionOf(command), new RunCleanUnderUnvalidatedJudge({ outcome: 0 }))
  },
)
