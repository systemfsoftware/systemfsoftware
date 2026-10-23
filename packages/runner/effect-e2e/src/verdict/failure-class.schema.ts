import * as Schema from 'effect/Schema'

import { Cause } from './cause.schema.js'
import type { FailureCode } from './failure.schema.js'

/**
 * How a failure code weighs on the run verdict. `blocking` is the blockable class: a run whose every
 * non-passing record is blocking ends `blocked`, because nothing in it says the product misbehaved.
 */
export const FailureClass = Schema.Literals(['blocking', 'failing', 'internal', 'interrupting'])
export type FailureClass = typeof FailureClass.Type

export const FailureClassRow = Schema.Struct({ cause: Cause, verdictClass: FailureClass })
export type FailureClassRow = typeof FailureClassRow.Type

const environment: FailureClassRow = { cause: 'environment', verdictClass: 'blocking' }
const automation: FailureClassRow = { cause: 'automation', verdictClass: 'failing' }
const product: FailureClassRow = { cause: 'product', verdictClass: 'failing' }

const ROWS: { readonly [Code in FailureCode]: FailureClassRow } = {
  MODEL_UNAVAILABLE: environment,
  MODEL_PROVIDER_FAILED: environment,
  MODEL_REFUSED: environment,
  AUTH_CREDENTIAL_UNAVAILABLE: environment,
  AUTH_CREDENTIAL_INVALID: environment,
  SECRET_UNAVAILABLE: environment,
  ENVIRONMENT_UNAVAILABLE: environment,
  APP_UNREACHABLE: environment,
  APP_NOT_OPEN: environment,
  ARTIFACT_WRITE_FAILED: environment,
  LOCATOR_NOT_FOUND: automation,
  LOCATOR_AMBIGUOUS: automation,
  ACTION_FAILED: automation,
  AUTOMATION_UNSUPPORTED: automation,
  UNSUPPORTED_CAPABILITY: automation,
  STEP_BUDGET_EXHAUSTED: automation,
  STEP_TIMEOUT: automation,
  STEP_NO_CONCLUSION: automation,
  STEP_NOT_AWAITED: automation,
  REPLAY_STALE: automation,
  POLICY_DENIED: automation,
  CONTEXT_OVERFLOW: automation,
  MODEL_OUTPUT_INVALID: automation,
  ASSERTION_INCONCLUSIVE: automation,
  ASSERTION_FAILED: product,
  INTERRUPTED: { cause: 'unclassified', verdictClass: 'interrupting' },
  INTERNAL_ERROR: { cause: 'unclassified', verdictClass: 'internal' },
}

export const failureClassOf = (code: FailureCode): FailureClassRow => ROWS[code]
