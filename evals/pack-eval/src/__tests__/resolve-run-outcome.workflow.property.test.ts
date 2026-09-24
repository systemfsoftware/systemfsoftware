import { it } from '@effect/vitest'
import { Equal, Match, Result } from 'effect'
import type { ResolveRunOutcomeDecision } from '../resolve-run-outcome.workflow.js'
import {
  ContradictionState as ContradictionStateSchema,
  resolveRunOutcome,
  ResolveRunOutcomeCommand,
  RunFault as RunFaultSchema,
} from '../resolve-run-outcome.workflow.js'

const decisionOf = (command: ResolveRunOutcomeCommand): ResolveRunOutcomeDecision =>
  Result.getOrThrow(resolveRunOutcome(command))

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
