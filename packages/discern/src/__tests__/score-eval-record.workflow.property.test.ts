import { it } from '@effect/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { type EvalScore, ScoreEvalRecord, scoreEvalRecord } from '../score-eval-record.workflow.js'
import { PatternStatus } from '../Verdict.schema.js'

type Score = typeof scoreEvalRecord

const cellOf = (score: Score, expected: boolean, status: PatternStatus): EvalScore =>
  Result.match(score(new ScoreEvalRecord({ expected, status })), {
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
  { of: [Schema.Boolean], subject: scoreEvalRecord },
  (subject, [expected]) => cellNameOf(cellOf(subject, expected, 'Match')) === (expected ? 'tp' : 'fp'),
)

// Kills a scorer that counts a deserved miss as a true negative.
it.prop(
  '∀e_Miss_=FnOrTn',
  { of: [Schema.Boolean], subject: scoreEvalRecord },
  (subject, [expected]) => cellNameOf(cellOf(subject, expected, 'Miss')) === (expected ? 'fn' : 'tn'),
)

// Kills a scorer that scores abstentions into a confusion cell.
it.prop(
  '∀e_Uncertain_=Abstained',
  { of: [Schema.Boolean], subject: scoreEvalRecord },
  (subject, [expected]) => cellNameOf(cellOf(subject, expected, 'Uncertain')) === 'abstained',
)

// Kills a scorer that can fail: scoring is total over every expected-status pair.
it.prop(
  '∀e_Score_=Total',
  { of: [Schema.Boolean, PatternStatus], subject: scoreEvalRecord },
  (subject, [expected, status]) => Result.isSuccess(subject(new ScoreEvalRecord({ expected, status }))),
)
