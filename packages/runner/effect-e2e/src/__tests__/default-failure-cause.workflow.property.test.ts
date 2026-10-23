import { it } from '@systemfsoftware/vitest'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { type Cause, type ProposedCause, ProposedCause as ProposedCauses } from '../verdict/cause.schema.js'
import { DefaultFailureCause, defaultFailureCause } from '../verdict/default-failure-cause.workflow.js'
import { type FailureCode, FailureCode as FailureCodes } from '../verdict/failure.schema.js'

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

const TAG_OF_CAUSE: { readonly [Key in Cause]: string } = {
  product: 'ProductCause',
  automation: 'AutomationCause',
  environment: 'EnvironmentCause',
  unclassified: 'UnclassifiedCause',
}

const tagsOf = (code: string, proposed: ProposedCause): readonly [string, string] => [
  Result.match(defaultFailureCause(new DefaultFailureCause({ code })), {
    onFailure: () => 'refused',
    onSuccess: (decision) => decision._tag,
  }),
  Result.match(defaultFailureCause(new DefaultFailureCause({ code, proposed })), {
    onFailure: () => 'refused',
    onSuccess: (decision) => decision._tag,
  }),
]

const recordedProposalOf = (code: FailureCode, proposed: ProposedCause): ProposedCause | undefined =>
  Result.match(defaultFailureCause(new DefaultFailureCause({ code, proposed })), {
    onFailure: () => undefined,
    onSuccess: (decision) => decision.proposed,
  })

it.prop(
  '∀c_DefaultFailureCause_≡Design10CauseRegardlessOfProposal',
  { of: [FailureCodes, ProposedCauses], subject: tagsOf, runs: 300, arbitrary: { seed: 499_001 } },
  (subject, [code, proposed]) => {
    const expected = TAG_OF_CAUSE[DESIGN_10_CAUSE[code]]
    const [bare, withProposal] = subject(code, proposed)
    return bare === expected && withProposal === expected
  },
)

it.prop(
  '∀s_DefaultFailureCause_≡UnclassifiedOutsideFailureCode',
  { of: [Schema.String, ProposedCauses], subject: tagsOf, runs: 100, arbitrary: { seed: 499_002 } },
  (subject, [suffix, proposed]) => {
    const [bare, withProposal] = subject(`unlisted:${suffix}`, proposed)
    return bare === 'UnclassifiedCause' && withProposal === 'UnclassifiedCause'
  },
)

it.prop(
  '∀p_DefaultFailureCause_≡ProposalKeptOrUnclassifiedWithoutEvidence',
  { of: [FailureCodes, ProposedCauses], subject: recordedProposalOf, runs: 200, arbitrary: { seed: 499_003 } },
  (subject, [code, proposed]) => {
    const recorded = subject(code, proposed)
    const expected: ProposedCause = proposed.evidence.length === 0
      ? { cause: 'unclassified', evidence: [] }
      : proposed
    return recorded !== undefined && Schema.toEquivalence(ProposedCauses)(recorded, expected)
  },
)
