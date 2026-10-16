import { Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

export class Connected extends Schema.TaggedClass<Connected>()('Connected', {}) {}
export class Absent extends Schema.TaggedClass<Absent>()('Absent', {}) {}
export const Evidence = Schema.Union([Connected, Absent])
export type Evidence = typeof Evidence.Type

export class AttributedCommand extends Schema.TaggedClass<AttributedCommand>()('AttributedCommand', {
  evidence: Evidence,
  length: Schema.Int,
  secret: Schema.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { length: 'tests.cell.length' } as const
}

const VerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/cell-attribution/Verdict')
type VerdictTypeId = typeof VerdictTypeId

export class Admitted extends Schema.TaggedClass<Admitted>()('Admitted', { length: Schema.Int }) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export class Refused extends Schema.TaggedClass<Refused>()('Refused', { why: Schema.String }) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export const Verdict = Schema.Union([Admitted, Refused])

export class Malformed extends Schema.TaggedError<Malformed>()('Malformed', { length: Schema.Int }) {
  readonly [VerdictTypeId] = VerdictTypeId
}

const verdictOf = (length: number): Admitted | Refused =>
  length > 0 ? new Admitted({ length }) : new Refused({ why: 'empty' })

export const attributedWorkflow = Workflow.make({
  command: AttributedCommand,
  decision: Verdict,
  error: Malformed,
  decide: (command): Result.Result<Admitted | Refused, Malformed> => Result.succeed(verdictOf(command.length)),
})

export const attributionCell = Sandwich.named('tests.cell.attribution')(
  (command: AttributedCommand) => Effect.succeed(command),
).decide(attributedWorkflow).write({
  Admitted: (decision) => Effect.succeed(decision.length),
  Refused: () => Effect.succeed(-1),
  Malformed: () => Effect.succeed(-2),
  CommandRejected: () => Effect.succeed(-3),
})

export const refusingWorkflow = Workflow.make({
  command: AttributedCommand,
  decision: Verdict,
  error: Malformed,
  decide: (command): Result.Result<Admitted | Refused, Malformed> =>
    Result.fail(new Malformed({ length: command.length })),
})

export const refusingCell = Sandwich.named('tests.cell.refusing')(
  (command: AttributedCommand) => Effect.succeed(command),
).decide(refusingWorkflow).write({
  Admitted: () => Effect.succeed(-1),
  Refused: () => Effect.succeed(-2),
  Malformed: (refusal) => Effect.succeed(refusal.length),
  CommandRejected: () => Effect.succeed(-3),
})
