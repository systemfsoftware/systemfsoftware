import { it } from '@effect/vitest'
import { Match, Result, Schema } from 'effect'
import type { AssessJudgeValidityDecision, JudgeLabelOutcome } from '../assess-judge-validity.workflow.js'
import {
  assessJudgeValidity,
  AssessJudgeValidityCommand,
  JudgeValidityRefused,
} from '../assess-judge-validity.workflow.js'

const outcomesOf = (
  passCount: number,
  failCount: number,
  hits: ReadonlyArray<number>,
): ReadonlyArray<JudgeLabelOutcome> => {
  const passBase = Array.from({ length: passCount }, (_, index) => index % 2 === 0)
  const failBase = Array.from({ length: failCount }, (_, index) => index % 2 !== 0)
  const flipped = new Set(hits.map((hit) => Math.abs(hit)))
  const passOutcomes = passBase.map((hit, index) => ({
    label: 'Pass' as const,
    verdict: (flipped.has(index) ? hit === false : hit) ? 'Pass' as const : 'Fail' as const,
  }))
  const failOutcomes = failBase.map((hit, index) => ({
    label: 'Fail' as const,
    verdict: (flipped.has(passCount + index) ? hit === false : hit) ? 'Fail' as const : 'Pass' as const,
  }))
  return [...passOutcomes, ...failOutcomes]
}

const commandOf = (
  passCount: number,
  failCount: number,
  hits: ReadonlyArray<number>,
  minimum: number,
): AssessJudgeValidityCommand =>
  new AssessJudgeValidityCommand({ outcomes: outcomesOf(passCount, failCount, hits), minimum })

const decisionOf = (command: AssessJudgeValidityCommand): AssessJudgeValidityDecision =>
  Result.getOrThrow(assessJudgeValidity(command))

const minimumOf = (draw: number): number => {
  const steps = 1 + (Math.abs(draw) % 9)
  return steps / 10
}

const rateOf = (hits: number, total: number): number => hits / total

const tagOf = (command: AssessJudgeValidityCommand): string =>
  Match.value(decisionOf(command)).pipe(
    Match.tag('JudgeValidated', () => 'JudgeValidated'),
    Match.tag('JudgeUnvalidated', () => 'JudgeUnvalidated'),
    Match.tag('JudgeValidityRefused', () => 'JudgeValidityRefused'),
    Match.exhaustive,
  )

const refusedOf = (command: AssessJudgeValidityCommand): JudgeValidityRefused | undefined =>
  Match.value(decisionOf(command)).pipe(
    Match.tag('JudgeValidityRefused', (refused) => refused),
    Match.tag('JudgeValidated', () => undefined),
    Match.tag('JudgeUnvalidated', () => undefined),
    Match.exhaustive,
  )

it.prop(
  '∀j_RateComparison_≡ValidatedOrShortRate',
  [Schema.Int, Schema.Int, Schema.Array(Schema.Int), Schema.Int],
  ([passDraw, failDraw, hits, minimumDraw]) => {
    const passCount = 2 + (Math.abs(passDraw) % 6)
    const failCount = 2 + (Math.abs(failDraw) % 6)
    const minimum = minimumOf(minimumDraw)
    const command = commandOf(passCount, failCount, hits, minimum)
    const outcomes = command.outcomes
    const passHits = outcomes.filter((outcome) => outcome.label === 'Pass' && outcome.verdict === 'Pass').length
    const failHits = outcomes.filter((outcome) => outcome.label === 'Fail' && outcome.verdict === 'Fail').length
    const tpr = rateOf(passHits, outcomes.filter((outcome) => outcome.label === 'Pass').length)
    const tnr = rateOf(failHits, outcomes.filter((outcome) => outcome.label === 'Fail').length)
    const refused = refusedOf(command)
    if (tpr + tnr <= 1) return refused !== undefined
    if (refused !== undefined) return false
    return Match.value(decisionOf(command)).pipe(
      Match.tag(
        'JudgeValidated',
        (validated) => tpr >= minimum && tnr >= minimum && validated.tpr === tpr && validated.tnr === tnr,
      ),
      Match.tag('JudgeUnvalidated', (unvalidated) => {
        const shortTpr = tpr < minimum
        const shortTnr = tnr < minimum
        const expected: 'TPR' | 'TNR' | 'both' | 'none' = shortTpr && shortTnr
          ? 'both' as const
          : shortTpr
          ? 'TPR' as const
          : shortTnr
          ? 'TNR' as const
          : 'none'
        return unvalidated.tpr === tpr &&
          unvalidated.tnr === tnr &&
          (shortTpr || shortTnr) &&
          Match.value(unvalidated.short).pipe(
            Match.when('TPR', () => expected === 'TPR'),
            Match.when('TNR', () => expected === 'TNR'),
            Match.when('both', () => expected === 'both'),
            Match.exhaustive,
          )
      }),
      Match.tag('JudgeValidityRefused', () => false),
      Match.exhaustive,
    )
  },
)

it.prop(
  '∀j_ExactMinimum_≡JudgeValidated',
  [Schema.Int, Schema.Int],
  ([passDraw, failDraw]) => {
    const total = 4 + (Math.abs(passDraw) % 4)
    const failTotal = 4 + (Math.abs(failDraw) % 4)
    const tprOutcomes = [
      ...Array.from({ length: total }, () => ({ label: 'Pass' as const, verdict: 'Pass' as const })),
      ...Array.from({ length: failTotal }, () => ({ label: 'Fail' as const, verdict: 'Fail' as const })),
    ]
    const tprMinimum = rateOf(total - 1, total)
    const tnrMinimum = rateOf(failTotal - 1, failTotal)
    const exactTpr = new AssessJudgeValidityCommand({
      outcomes: tprOutcomes.map((outcome, index) =>
        index === 0
          ? { label: 'Pass' as const, verdict: 'Fail' as const }
          : outcome
      ),
      minimum: tprMinimum,
    })
    const exactTnr = new AssessJudgeValidityCommand({
      outcomes: tprOutcomes.map((outcome, index) =>
        index === total
          ? { label: 'Fail' as const, verdict: 'Pass' as const }
          : outcome
      ),
      minimum: tnrMinimum,
    })
    return tagOf(exactTpr) === 'JudgeValidated' && tagOf(exactTnr) === 'JudgeValidated'
  },
)

it.prop(
  '∀j_OneClassLabels_≡JudgeValidityRefused',
  [Schema.Int, Schema.Int, Schema.Int],
  ([countDraw, hitDraw, minimumDraw]) => {
    const count = 1 + (Math.abs(countDraw) % 6)
    const hits = [hitDraw]
    const minimum = minimumOf(minimumDraw)
    const allPass = commandOf(count, 0, hits, minimum)
    const allFail = commandOf(0, count, hits, minimum)
    return tagOf(allPass) === 'JudgeValidityRefused' && tagOf(allFail) === 'JudgeValidityRefused' &&
      refusedOf(allPass) !== undefined && refusedOf(allFail) !== undefined
  },
)
