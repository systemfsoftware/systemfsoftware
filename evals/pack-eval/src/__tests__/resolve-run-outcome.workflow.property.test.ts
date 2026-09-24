import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import { ContradictionNotEvaluated } from '../eval-report.schema.js'
import type { ContradictionState, ResolveRunOutcomeDecision, RunFault } from '../resolve-run-outcome.workflow.js'
import {
  ContradictionUnvalidated,
  ContradictionValidated,
  ContradictionValidityRefused,
  resolveRunOutcome,
  ResolveRunOutcomeCommand,
  RunCleanUnderRefusedValidity,
  RunCleanUnderUnvalidatedJudge,
  RunCleanUnderValidatedJudge,
  RunFailedOnWitnessedContradiction,
  RunInputRefused,
  RunNotYetEvaluated,
  RunProviderError,
  RunRefused,
} from '../resolve-run-outcome.workflow.js'

const STATE_TAGS = ['not-evaluated', 'validated', 'unvalidated', 'refused'] as const
const FAULT_TAGS = ['none', 'input-refused', 'provider-error'] as const

type StateTag = (typeof STATE_TAGS)[number]
type FaultTag = (typeof FAULT_TAGS)[number]

const stateOf = (tag: StateTag, witnessedFailures: number): ContradictionState => {
  if (tag === 'validated') return new ContradictionValidated({ witnessedFailures })
  if (tag === 'unvalidated') return new ContradictionUnvalidated({ witnessedFailures })
  if (tag === 'refused') return new ContradictionValidityRefused({ reason: 'a one-class test split' })
  return new ContradictionNotEvaluated()
}

const faultOf = (tag: FaultTag, detail: string): RunFault | undefined => {
  if (tag === 'input-refused') return new RunInputRefused({ detail })
  if (tag === 'provider-error') return new RunProviderError({ detail })
  return undefined
}

const commandOf = (state: ContradictionState, fault: RunFault | undefined): ResolveRunOutcomeCommand =>
  fault === undefined
    ? new ResolveRunOutcomeCommand({ contradiction: state })
    : new ResolveRunOutcomeCommand({ contradiction: state, fault })

/** The outcome table of the High-Level Technical Design, written out independently. */
const expectedOf = (
  stateTag: StateTag,
  faultTag: FaultTag,
  witnessedFailures: number,
  detail: string,
): ResolveRunOutcomeDecision => {
  const fault = faultOf(faultTag, detail)
  if (fault !== undefined) return new RunRefused({ outcome: 2, fault })
  if (stateTag === 'validated') {
    return witnessedFailures > 0
      ? new RunFailedOnWitnessedContradiction({ outcome: 1, witnessedFailures })
      : new RunCleanUnderValidatedJudge({ outcome: 0 })
  }
  if (stateTag === 'unvalidated') return new RunCleanUnderUnvalidatedJudge({ outcome: 0 })
  if (stateTag === 'refused') return new RunCleanUnderRefusedValidity({ outcome: 0 })
  return new RunNotYetEvaluated({ outcome: 0 })
}

const decisionOf = (command: ResolveRunOutcomeCommand): ResolveRunOutcomeDecision =>
  Result.getOrThrow(resolveRunOutcome(command))

it.prop(
  '∀s_contradictionState×Fault_≡OutcomeTableRow',
  [Schema.Literals(STATE_TAGS), Schema.Literals(FAULT_TAGS), Schema.Int, Schema.String],
  ([stateTag, faultTag, witnessedFailures, detailDraw]) => {
    const detail = `pack file named by the refusal ${detailDraw}`
    const command = commandOf(stateOf(stateTag, witnessedFailures), faultOf(faultTag, detail))
    return Equal.equals(decisionOf(command), expectedOf(stateTag, faultTag, witnessedFailures, detail))
  },
)

it.prop(
  '∀s_unvalidatedJudgeWithWitnessedFails_≡AdvisoryNeverFailsTheRun',
  [Schema.Int],
  ([failuresDraw]) => {
    const witnessedFailures = 1 + Math.abs(failuresDraw)
    const command = commandOf(new ContradictionUnvalidated({ witnessedFailures }), undefined)
    return Equal.equals(decisionOf(command), new RunCleanUnderUnvalidatedJudge({ outcome: 0 }))
  },
)
