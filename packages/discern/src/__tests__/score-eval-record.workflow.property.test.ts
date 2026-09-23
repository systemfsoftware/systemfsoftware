import { it } from '@effect/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { type EvalScore, ScoreEvalRecord, scoreEvalRecord } from '../score-eval-record.workflow.js'
import { PatternStatus } from '../Verdict.schema.js'

const cellOf = (expected: boolean, status: PatternStatus): EvalScore =>
  Result.match(scoreEvalRecord(new ScoreEvalRecord({ expected, status })), {
    onFailure: (missing: never) => missing,
    onSuccess: (cell) => cell,
  })

const cellNameOf = (decision: EvalScore): string =>
  Match.value(decision).pipe(
    Match.tag('TruePositive', () => 'tp'),
    Match.tag('FalsePositive', () => 'fp'),
    Match.tag('TrueNegative', () => 'tn'),
    Match.tag('FalseNegative', () => 'fn'),
    Match.tag('Abstained', () => 'abstained'),
    Match.exhaustive,
  )

// Kills a scorer that rewards a miss or punishes a correct positive prediction.
it.prop(
  '∀e_Match_=TpOrFp',
  [Schema.Boolean],
  ([expected]) => cellNameOf(cellOf(expected, 'Match')) === (expected ? 'tp' : 'fp'),
)

// Kills a scorer that counts a deserved miss as a true negative.
it.prop(
  '∀e_Miss_=FnOrTn',
  [Schema.Boolean],
  ([expected]) => cellNameOf(cellOf(expected, 'Miss')) === (expected ? 'fn' : 'tn'),
)

// Kills a scorer that scores abstentions into a confusion cell.
it.prop(
  '∀e_Uncertain_=Abstained',
  [Schema.Boolean],
  ([expected]) => cellNameOf(cellOf(expected, 'Uncertain')) === 'abstained',
)

// Kills a scorer that can fail: scoring is total over every expected-status pair.
it.prop(
  '∀e_Score_=Total',
  [Schema.Boolean, PatternStatus],
  ([expected, status]) => Result.isSuccess(scoreEvalRecord(new ScoreEvalRecord({ expected, status }))),
)
