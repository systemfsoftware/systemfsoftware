import { it } from '@effect/vitest'
import { Match, Result, Schema } from 'effect'
import type { JudgeLabelOutcome } from '../assess-judge-validity.workflow.js'
import {
  assessJudgeValidity,
  AssessJudgeValidityCommand,
  JudgeValidityRefused,
} from '../assess-judge-validity.workflow.js'

const trialsIn = (draw: number): number => 2 + draw

const minimumIn = (draw: number): number => 0.1 + draw / 10

const allPassOutcomesOf = (count: number): ReadonlyArray<JudgeLabelOutcome> =>
  Array.from({ length: count }, () => ({ label: 'Pass' as const, verdict: 'Pass' as const }))

const allFailOutcomesOf = (count: number): ReadonlyArray<JudgeLabelOutcome> =>
  Array.from({ length: count }, () => ({ label: 'Fail' as const, verdict: 'Fail' as const }))

const isRefused = Schema.is(JudgeValidityRefused)

const refusedTagOf = (command: AssessJudgeValidityCommand): string =>
  Match.value(Result.getOrThrow(assessJudgeValidity(command))).pipe(
    Match.tag('JudgeValidated', () => 'JudgeValidated'),
    Match.tag('JudgeUnvalidated', () => 'JudgeUnvalidated'),
    Match.tag('JudgeValidityRefused', () => 'JudgeValidityRefused'),
    Match.exhaustive,
  )

it.prop(
  '∀j_ExactMinimum_≡JudgeValidated',
  [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4 }))),
  ],
  ([passDraw, failDraw]) => {
    const passCount = trialsIn(passDraw)
    const failCount = trialsIn(failDraw)
    const exactTpr = new AssessJudgeValidityCommand({
      outcomes: [
        { label: 'Pass', verdict: 'Fail' },
        ...allPassOutcomesOf(passCount).slice(0, passCount - 1),
        ...allFailOutcomesOf(failCount),
      ],
      minimum: (passCount - 1) / passCount,
    })
    const exactTnr = new AssessJudgeValidityCommand({
      outcomes: [
        ...allPassOutcomesOf(passCount),
        { label: 'Fail', verdict: 'Pass' },
        ...allFailOutcomesOf(failCount).slice(0, failCount - 1),
      ],
      minimum: (failCount - 1) / failCount,
    })
    return refusedTagOf(exactTpr) === 'JudgeValidated' && refusedTagOf(exactTnr) === 'JudgeValidated'
  },
)

it.prop(
  '∀j_OneClassLabels_≡JudgeValidityRefused',
  [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 8 }))),
  ],
  ([countDraw, minimumDraw]) => {
    const count = trialsIn(countDraw)
    const minimum = minimumIn(minimumDraw)
    const allPass = new AssessJudgeValidityCommand({ outcomes: allPassOutcomesOf(count), minimum })
    const allFail = new AssessJudgeValidityCommand({ outcomes: allFailOutcomesOf(count), minimum })
    return refusedTagOf(allPass) === 'JudgeValidityRefused' &&
      refusedTagOf(allFail) === 'JudgeValidityRefused' &&
      isRefused(Result.getOrThrow(assessJudgeValidity(allPass))) &&
      Match.value(Result.getOrThrow(assessJudgeValidity(allFail))).pipe(
        Match.tag('JudgeValidityRefused', () => true),
        Match.tag('JudgeValidated', () => false),
        Match.tag('JudgeUnvalidated', () => false),
        Match.exhaustive,
      )
  },
)
