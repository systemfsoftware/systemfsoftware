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
  judgeDualExits,
} from '../judge-dual-exits.workflow.js'

const decisionOf = <A>(result: Result.Result<A, never>): A =>
  Result.match(result, {
    onFailure: (unreachable: never): A => absurd(unreachable),
    onSuccess: (decision: A): A => decision,
  })

const decide = (bothSucceeded: boolean, oracleHeld: boolean, failuresMatch: boolean): DualExitJudgement =>
  decisionOf(judgeDualExits(new JudgeDualExits({ bothSucceeded, oracleHeld, failuresMatch })))

it.prop(
  '∀b_DualExits_≡Agreed',
  { of: [Schema.Boolean, Schema.Boolean, Schema.Boolean], subject: decide },
  (subject, [bothSucceeded, oracleHeld, failuresMatch]) =>
    Schema.is(Agreed)(subject(bothSucceeded, oracleHeld, failuresMatch)) ===
      (bothSucceeded ? oracleHeld : failuresMatch),
)

it.prop(
  '∀b_DualExits_≡DisagreedByOutput',
  { of: [Schema.Boolean, Schema.Boolean, Schema.Boolean], subject: decide },
  (subject, [bothSucceeded, oracleHeld, failuresMatch]) =>
    Schema.is(DisagreedByOutput)(subject(bothSucceeded, oracleHeld, failuresMatch)) ===
      (bothSucceeded && !oracleHeld),
)

it.prop(
  '∀b_DualExits_≡DisagreedByFingerprint',
  { of: [Schema.Boolean, Schema.Boolean, Schema.Boolean], subject: decide },
  (subject, [bothSucceeded, oracleHeld, failuresMatch]) =>
    Schema.is(DisagreedByFailureFingerprint)(subject(bothSucceeded, oracleHeld, failuresMatch)) ===
      (!bothSucceeded && !failuresMatch),
)
