import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Result, Schema } from 'effect'
import type { JudgeVerdict } from './contradiction-verdict.schema.js'
import { JudgeVerdict as JudgeVerdictSchema } from './contradiction-verdict.schema.js'

const AssessJudgeValidityTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/AssessJudgeValidity')
type AssessJudgeValidityTypeId = typeof AssessJudgeValidityTypeId

export class JudgeLabelOutcome extends Schema.Class<JudgeLabelOutcome>('JudgeLabelOutcome')({
  label: JudgeVerdictSchema,
  verdict: JudgeVerdictSchema,
}) {}

export class JudgeValidated extends Schema.TaggedClass<JudgeValidated>()('JudgeValidated', {
  tpr: Schema.Finite,
  tnr: Schema.Finite,
}) {
  readonly [AssessJudgeValidityTypeId] = AssessJudgeValidityTypeId
}

export const JudgeShortRate = Schema.Literals(['TPR', 'TNR', 'both'])
export type JudgeShortRate = typeof JudgeShortRate.Type

export class JudgeUnvalidated extends Schema.TaggedClass<JudgeUnvalidated>()('JudgeUnvalidated', {
  tpr: Schema.Finite,
  tnr: Schema.Finite,
  short: JudgeShortRate,
}) {
  readonly [AssessJudgeValidityTypeId] = AssessJudgeValidityTypeId
}

export class JudgeValidityRefused extends Schema.TaggedClass<JudgeValidityRefused>()('JudgeValidityRefused', {
  reason: Schema.NonEmptyString,
}) {
  readonly [AssessJudgeValidityTypeId] = AssessJudgeValidityTypeId
}

export const AssessJudgeValidityDecision = Schema.Union([JudgeValidated, JudgeUnvalidated, JudgeValidityRefused])
export type AssessJudgeValidityDecision = typeof AssessJudgeValidityDecision.Type

export class AssessJudgeValidityCommand extends Schema.Class<AssessJudgeValidityCommand>('AssessJudgeValidityCommand')({
  outcomes: Schema.Array(JudgeLabelOutcome),
  minimum: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

interface JudgeRates {
  readonly tpr: number
  readonly tnr: number
}

const rateOf = (hits: number, total: number): number => hits / total

const ratesOf = (outcomes: ReadonlyArray<JudgeLabelOutcome>): JudgeRates => {
  const passes = outcomes.filter((outcome) => outcome.label === 'Pass')
  const fails = outcomes.filter((outcome) => outcome.label === 'Fail')
  return {
    tpr: rateOf(
      passes.filter((outcome) => outcome.verdict === 'Pass').length,
      passes.length,
    ),
    tnr: rateOf(
      fails.filter((outcome) => outcome.verdict === 'Fail').length,
      fails.length,
    ),
  }
}

const shortOf = (rates: JudgeRates, minimum: number): JudgeShortRate =>
  Match.value([rates.tpr < minimum, rates.tnr < minimum] as const).pipe(
    Match.when([true, true], () => 'both' as const),
    Match.when([true, false], () => 'TPR' as const),
    Match.when([false, true], () => 'TNR' as const),
    Match.when([false, false], () => 'both' as const),
    Match.exhaustive,
  )

const verdictOf = (rates: JudgeRates, minimum: number): JudgeValidated | JudgeUnvalidated =>
  Option.getOrElse(
    validatedOf(rates, minimum),
    () => new JudgeUnvalidated({ tpr: rates.tpr, tnr: rates.tnr, short: shortOf(rates, minimum) }),
  )

const validatedOf = (
  rates: JudgeRates,
  minimum: number,
): Option.Option<JudgeValidated> =>
  Match.value([rates.tpr >= minimum, rates.tnr >= minimum] as const).pipe(
    Match.when([true, true], () => Option.some(new JudgeValidated({ tpr: rates.tpr, tnr: rates.tnr }))),
    Match.when([true, false], () => Option.none<JudgeValidated>()),
    Match.when([false, true], () => Option.none<JudgeValidated>()),
    Match.when([false, false], () => Option.none<JudgeValidated>()),
    Match.exhaustive,
  )

const refusedEmpty: JudgeValidityRefused = new JudgeValidityRefused({
  reason: 'the judge has no test outcomes to assess',
})

const refusedOneClass = (
  outcomes: ReadonlyArray<JudgeLabelOutcome>,
  present: JudgeVerdict,
): JudgeValidityRefused =>
  new JudgeValidityRefused({
    reason: `the test labels carry the '${present}' class only (${outcomes.length} outcomes)`,
  })

const refusedChance = (rates: JudgeRates): JudgeValidityRefused =>
  new JudgeValidityRefused({
    reason: `the judge is no better than chance on the test split (tpr ${rates.tpr} + tnr ${rates.tnr} <= 1)`,
  })

const commandRefusalOf = (
  command: AssessJudgeValidityCommand,
  empty: boolean,
  onlyFail: boolean,
  onlyPass: boolean,
): Option.Option<JudgeValidityRefused> =>
  Match.value([empty, onlyFail, onlyPass] as const).pipe(
    Match.when([true, false, false], () => Option.some(refusedEmpty)),
    Match.when([false, true, false], () => Option.some(refusedOneClass(command.outcomes, 'Fail'))),
    Match.when([false, false, true], () => Option.some(refusedOneClass(command.outcomes, 'Pass'))),
    Match.when([true, true, true], () => Option.some(refusedEmpty)),
    Match.when([true, true, false], () => Option.some(refusedEmpty)),
    Match.when([true, false, true], () => Option.some(refusedEmpty)),
    Match.when([false, true, true], () => Option.some(refusedOneClass(command.outcomes, 'Fail'))),
    Match.when([false, false, false], () => Option.none<JudgeValidityRefused>()),
    Match.exhaustive,
  )

const decidedOf = (
  command: AssessJudgeValidityCommand,
  aboveChance: boolean,
): AssessJudgeValidityDecision =>
  Match.value(aboveChance).pipe(
    Match.when(true, () => verdictOf(ratesOf(command.outcomes), command.minimum)),
    Match.when(false, () => refusedChance(ratesOf(command.outcomes))),
    Match.exhaustive,
  )

const decide = (command: AssessJudgeValidityCommand): Result.Result<AssessJudgeValidityDecision, never> =>
  Result.succeed(
    Option.getOrElse(
      commandRefusalOf(
        command,
        command.outcomes.length === 0,
        command.outcomes.filter((outcome) => outcome.label === 'Pass').length === 0,
        command.outcomes.filter((outcome) => outcome.label === 'Fail').length === 0,
      ),
      () =>
        decidedOf(
          command,
          ratesOf(command.outcomes).tpr + ratesOf(command.outcomes).tnr > 1,
        ),
    ),
  )

export const assessJudgeValidity = Workflow.make({
  command: AssessJudgeValidityCommand,
  decision: AssessJudgeValidityDecision,
  error: Schema.Never,
  decide,
})
