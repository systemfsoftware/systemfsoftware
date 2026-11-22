import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  Agreed,
  DisagreedByFailureFingerprint,
  DisagreedByOutput,
  type DualExitJudgement,
  JudgeDualExits,
} from '../judge-dual-exits.schema.js'
import { judgeDualExits } from '../judge-dual-exits.workflow.js'

const decisionOf = <A>(result: Result.Result<A, never>): A =>
  Result.match(result, {
    onFailure: (unreachable: never): A => absurd(unreachable),
    onSuccess: (decision: A): A => decision,
  })

const decideOf =
  (workflow: typeof judgeDualExits) =>
  (bothSucceeded: boolean, oracleHeld: boolean, failuresMatch: boolean): DualExitJudgement =>
    decisionOf(workflow(JudgeDualExits.make({ bothSucceeded, oracleHeld, failuresMatch })))

it.prop(
  '∀b_DualExits_≡Agreed',
  { of: [Schema.Boolean, Schema.Boolean, Schema.Boolean], subject: judgeDualExits },
  (subject, [bothSucceeded, oracleHeld, failuresMatch]) =>
    Schema.is(Agreed)(decideOf(subject)(bothSucceeded, oracleHeld, failuresMatch)) ===
      (bothSucceeded ? oracleHeld : failuresMatch),
)

it.prop(
  '∀b_DualExits_≡DisagreedByOutput',
  { of: [Schema.Boolean, Schema.Boolean, Schema.Boolean], subject: judgeDualExits },
  (subject, [bothSucceeded, oracleHeld, failuresMatch]) =>
    Schema.is(DisagreedByOutput)(decideOf(subject)(bothSucceeded, oracleHeld, failuresMatch)) ===
      (bothSucceeded && !oracleHeld),
)

it.prop(
  '∀b_DualExits_≡DisagreedByFingerprint',
  { of: [Schema.Boolean, Schema.Boolean, Schema.Boolean], subject: judgeDualExits },
  (subject, [bothSucceeded, oracleHeld, failuresMatch]) =>
    Schema.is(DisagreedByFailureFingerprint)(decideOf(subject)(bothSucceeded, oracleHeld, failuresMatch)) ===
      (!bothSucceeded && !failuresMatch),
)
