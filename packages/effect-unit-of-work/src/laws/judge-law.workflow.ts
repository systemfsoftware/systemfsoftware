import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Order, Schema } from 'effect'
import * as Result from 'effect/Result'

const VerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-unit-of-work/laws/Verdict')
type VerdictTypeId = typeof VerdictTypeId

/** A law held for the subject it ran against. */
export class Held extends Schema.TaggedClass<Held>()('Held', {}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

/** A law did not hold; `law` names it and `witness` reports what was observed. */
export class Broken extends Schema.TaggedClass<Broken>()('Broken', {
  law: Schema.String,
  witness: Schema.String,
}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

/** What a law decided about its subject. */
export const Verdict = Schema.Union([Held, Broken])
export type Verdict = typeof Verdict.Type

/** A law compared one rendered value with another. */
export class Comparison extends Schema.TaggedClass<Comparison>()('Comparison', {
  expected: Schema.String,
  observed: Schema.String,
}) {}

/** A law wrote two keys in either order and compared what each order left. */
export class CrossKeyCommute extends Schema.TaggedClass<CrossKeyCommute>()('CrossKeyCommute', {
  expected: Schema.String,
  ordered: Schema.String,
  reversed: Schema.String,
}) {}

/** A law read one key after concurrent writes and checked the value against the serial orders. */
export class SerialOrder extends Schema.TaggedClass<SerialOrder>()('SerialOrder', {
  observed: Schema.String,
  candidates: Schema.Array(Schema.String),
}) {}

/** A law used a unit after its unit of work ended and watched whether the use died before the work ran. */
export class EndedUnit extends Schema.TaggedClass<EndedUnit>()('EndedUnit', {
  died: Schema.Boolean,
}) {}

/** A law armed a serialization failure once and counted the unit's runs and its committed value. */
export class EngineRerun extends Schema.TaggedClass<EngineRerun>()('EngineRerun', {
  runs: Schema.Finite,
  expected: Schema.String,
  observed: Schema.String,
}) {}

/** A law raced claims and counted the decisions, the grants, and the stored rows. */
export class Race extends Schema.TaggedClass<Race>()('Race', {
  requested: Schema.Finite,
  cap: Schema.Finite,
  granted: Schema.Finite,
  decided: Schema.Finite,
  rows: Schema.Finite,
}) {}

/** Every observation a law can bring for judgement. */
export const LawObservation = Schema.Union([Comparison, CrossKeyCommute, SerialOrder, EndedUnit, EngineRerun, Race])
export type LawObservation = typeof LawObservation.Type

/** The decision a law asks the kit to reach: one observation, one verdict. */
export class JudgeLaw extends Schema.TaggedClass<JudgeLaw>()('JudgeLaw', {
  law: Schema.String,
  observation: LawObservation,
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    law: 'uow.law.name',
    observation: 'uow.law.observation',
  } as const
}

const verdictOf = (law: string, expected: string, observed: string): Verdict =>
  Match.value(observed === expected).pipe(
    Match.when(true, () => new Held({})),
    Match.when(false, () => new Broken({ law, witness: `expected ${expected}, observed ${observed}` })),
    Match.exhaustive,
  )

const crossKeyCommute = (law: string, observation: CrossKeyCommute): Verdict =>
  Match.value(observation.ordered === observation.expected).pipe(
    Match.when(true, () => verdictOf(law, observation.expected, observation.reversed)),
    Match.when(false, () => verdictOf(law, observation.expected, observation.ordered)),
    Match.exhaustive,
  )

const serialOrder = (law: string, observation: SerialOrder): Verdict =>
  Match.value(observation.candidates.includes(observation.observed)).pipe(
    Match.when(true, () => new Held({})),
    Match.when(false, () =>
      new Broken({
        law,
        witness: `observed ${observation.observed}, no serial order over ${
          observation.candidates.join(' or ')
        } leaves that`,
      })),
    Match.exhaustive,
  )

const endedUnit = (law: string, observation: EndedUnit): Verdict =>
  Match.value(observation.died).pipe(
    Match.when(true, () => new Held({})),
    Match.when(false, () => new Broken({ law, witness: 'the leaked unit ran without dying' })),
    Match.exhaustive,
  )

const engineRerun = (law: string, observation: EngineRerun): Verdict =>
  Match.value(observation.runs === 2).pipe(
    Match.when(true, () => verdictOf(law, observation.expected, observation.observed)),
    Match.when(false, () =>
      new Broken({ law, witness: `the unit ran ${observation.runs} time(s) under a once-armed 40001, not twice` })),
    Match.exhaustive,
  )

const expectedGrants = (observation: Race): number => Order.min(Order.Number)(observation.cap, observation.requested)

const raceVerdict = (law: string, observation: Race): Verdict =>
  Match.value(observation.decided === observation.requested).pipe(
    Match.when(true, () => raceGrants(law, observation)),
    Match.when(false, () =>
      new Broken({
        law,
        witness: `${observation.requested - observation.decided} of ${observation.requested} claim(s) went undecided`,
      })),
    Match.exhaustive,
  )

const raceGrants = (law: string, observation: Race): Verdict =>
  Match.value(observation.granted === expectedGrants(observation)).pipe(
    Match.when(true, () => raceRows(law, observation)),
    Match.when(false, () =>
      new Broken({
        law,
        witness: `granted ${observation.granted} of ${
          expectedGrants(observation)
        }, cap ${observation.cap} over ${observation.requested} claims`,
      })),
    Match.exhaustive,
  )

const raceRows = (law: string, observation: Race): Verdict =>
  Match.value(observation.rows === observation.granted).pipe(
    Match.when(true, () => new Held({})),
    Match.when(
      false,
      () => new Broken({ law, witness: `stored ${observation.rows} row(s) after granting ${observation.granted}` }),
    ),
    Match.exhaustive,
  )

/** Judges one law observation into a verdict. */
export const judgeLaw = Workflow.make({
  command: JudgeLaw,
  decision: Verdict,
  error: Schema.Never,
  decide: (command): Result.Result<Verdict, never> =>
    Result.succeed(
      Match.value(command.observation).pipe(
        Match.tag('Comparison', (observation): Verdict =>
          verdictOf(command.law, observation.expected, observation.observed)),
        Match.tag('CrossKeyCommute', (observation): Verdict =>
          crossKeyCommute(command.law, observation)),
        Match.tag('SerialOrder', (observation): Verdict => serialOrder(command.law, observation)),
        Match.tag('EndedUnit', (observation): Verdict => endedUnit(command.law, observation)),
        Match.tag('EngineRerun', (observation): Verdict => engineRerun(command.law, observation)),
        Match.tag('Race', (observation): Verdict => raceVerdict(command.law, observation)),
        Match.exhaustive,
      ),
    ),
})
