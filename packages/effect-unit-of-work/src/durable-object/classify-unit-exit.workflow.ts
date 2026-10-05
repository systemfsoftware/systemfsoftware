import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Cause, Exit, Option, Schema } from 'effect'
import * as Result from 'effect/Result'

const UnitExitTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-unit-of-work/durable-object/UnitExit')

export class Committed extends Schema.TaggedClass<Committed>()('Committed', {}) {
  readonly [UnitExitTypeId] = UnitExitTypeId
}

export class RolledBack extends Schema.TaggedClass<RolledBack>()('RolledBack', {}) {
  readonly [UnitExitTypeId] = UnitExitTypeId
}

export class WentAsync extends Schema.TaggedClass<WentAsync>()('WentAsync', {
  error: Schema.instanceOf(Cause.AsyncFiberError),
}) {
  readonly [UnitExitTypeId] = UnitExitTypeId
}

export const UnitExit = Schema.Union([Committed, RolledBack, WentAsync])
export type UnitExit = typeof UnitExit.Type

export class ClassifyUnitExit extends Schema.TaggedClass<ClassifyUnitExit>()('ClassifyUnitExit', {
  exit: Schema.Exit(Schema.Unknown, Schema.Unknown, Schema.Unknown),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const asyncErrorOf = <Failure>(cause: Cause.Cause<Failure>): Option.Option<Cause.AsyncFiberError> =>
  Option.flatMap(
    Option.fromUndefinedOr(cause.reasons.find(Cause.isDieReason)),
    (reason) => Option.filter(Option.fromUndefinedOr(reason.defect), Cause.isAsyncFiberError),
  )

const failureOf = <Failure>(cause: Cause.Cause<Failure>): UnitExit =>
  Option.match(asyncErrorOf(cause), {
    onNone: () => new RolledBack({}),
    onSome: (error) => new WentAsync({ error }),
  })

const decisionOf = (command: ClassifyUnitExit): UnitExit =>
  Exit.match(command.exit, {
    onSuccess: () => new Committed({}),
    onFailure: failureOf,
  })

export const classifyUnitExit = Workflow.make({
  command: ClassifyUnitExit,
  decision: UnitExit,
  error: Schema.Never,
  decide: (command): Result.Result<UnitExit, never> => Result.succeed(decisionOf(command)),
})
