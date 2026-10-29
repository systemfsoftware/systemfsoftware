import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const JudgeEdgePlacementTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/JudgeEdgePlacement')
type JudgeEdgePlacementTypeId = typeof JudgeEdgePlacementTypeId

export class EdgePlacementHeld
  extends Schema.TaggedClass<EdgePlacementHeld, { readonly brand: unique symbol }>()('EdgePlacementHeld', {
    conjunct: Schema.String,
    inspected: Schema.Array(Schema.String),
  })
{
  readonly [JudgeEdgePlacementTypeId] = JudgeEdgePlacementTypeId
}

export class EdgePlacementBroken
  extends Schema.TaggedClass<EdgePlacementBroken, { readonly brand: unique symbol }>()('EdgePlacementBroken', {
    conjunct: Schema.String,
    inspected: Schema.Array(Schema.String),
    detail: Schema.String,
  })
{
  readonly [JudgeEdgePlacementTypeId] = JudgeEdgePlacementTypeId
}

export const JudgeEdgePlacementDecision = Schema.Union([EdgePlacementHeld, EdgePlacementBroken])
export type JudgeEdgePlacementDecision = typeof JudgeEdgePlacementDecision.Type

export class JudgeEdgePlacement
  extends Schema.TaggedClass<JudgeEdgePlacement, { readonly brand: unique symbol }>()('JudgeEdgePlacement', {
    conjunct: Schema.String,
    placed: Schema.Array(Schema.String),
    reached: Schema.Array(Schema.String),
    detail: Schema.String,
  })
{
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const everyPlaced = (placed: ReadonlyArray<string>, reached: ReadonlyArray<string>): boolean =>
  Arr.every(placed, (spanId) => Arr.some(reached, (candidate) => candidate === spanId))

const decide = (command: JudgeEdgePlacement): Result.Result<JudgeEdgePlacementDecision, never> =>
  Result.succeed(
    Match.value(everyPlaced(command.placed, command.reached)).pipe(
      Match.when(true, () => new EdgePlacementHeld({ conjunct: command.conjunct, inspected: command.placed })),
      Match.when(false, () =>
        new EdgePlacementBroken({
          conjunct: command.conjunct,
          inspected: command.placed,
          detail: command.detail,
        })),
      Match.exhaustive,
    ),
  )

export const judgeEdgePlacement = Workflow.make({
  command: JudgeEdgePlacement,
  decision: JudgeEdgePlacementDecision,
  error: Schema.Never,
  decide,
})
