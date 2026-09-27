import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  DisagreedOnOrder,
  DisagreedOnSeeded,
  type DisagreementAttempt,
  NoDisagreement,
  SelectDisagreementAttempt,
} from '../select-disagreement-attempt.schema.js'
import { selectDisagreementAttempt } from '../select-disagreement-attempt.workflow.js'

const decisionOf = <A>(result: Result.Result<A, never>): A =>
  Result.match(result, {
    onFailure: (unreachable: never): A => absurd(unreachable),
    onSuccess: (decision: A): A => decision,
  })

const decide = (orderDisagrees: boolean, seededDisagrees: boolean): DisagreementAttempt =>
  decisionOf(selectDisagreementAttempt(new SelectDisagreementAttempt({ orderDisagrees, seededDisagrees })))

it.prop(
  '∀b_Disagreement_≡OnOrder',
  { of: [Schema.Boolean, Schema.Boolean], subject: decide },
  (subject, [orderDisagrees, seededDisagrees]) =>
    Schema.is(DisagreedOnOrder)(subject(orderDisagrees, seededDisagrees)) === orderDisagrees,
)

it.prop(
  '∀b_Disagreement_≡OnSeeded',
  { of: [Schema.Boolean, Schema.Boolean], subject: decide },
  (subject, [orderDisagrees, seededDisagrees]) =>
    Schema.is(DisagreedOnSeeded)(subject(orderDisagrees, seededDisagrees)) === (!orderDisagrees && seededDisagrees),
)

it.prop(
  '∀b_Disagreement_≡None',
  { of: [Schema.Boolean, Schema.Boolean], subject: decide },
  (subject, [orderDisagrees, seededDisagrees]) =>
    Schema.is(NoDisagreement)(subject(orderDisagrees, seededDisagrees)) === (!orderDisagrees && !seededDisagrees),
)
