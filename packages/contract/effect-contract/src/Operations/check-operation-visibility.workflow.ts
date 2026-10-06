import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Principal, Subject } from '../Principal/principal.schema.js'

const VisibilityTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-contract/OperationVisibility')

export class OperationVisible extends Schema.TaggedClass<OperationVisible>()('OperationVisible', {}) {
  readonly [VisibilityTypeId] = VisibilityTypeId
}

export class OperationHidden extends Schema.TaggedClass<OperationHidden>()('OperationHidden', {}) {
  readonly [VisibilityTypeId] = VisibilityTypeId
}

export class CheckOperationVisibility extends Schema.TaggedClass<CheckOperationVisibility>()(
  'CheckOperationVisibility',
  {
    owner: Principal,
    principal: Principal,
  },
) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const subjectEquivalence = Schema.toEquivalence(Subject)

const admit = (visible: boolean): Result.Result<OperationVisible | OperationHidden, never> =>
  Match.value(visible).pipe(
    Match.when(true, () => Result.succeed(new OperationVisible({}))),
    Match.when(false, () => Result.succeed(new OperationHidden({}))),
    Match.exhaustive,
  )

const decideVisibility = (
  command: CheckOperationVisibility,
): Result.Result<OperationVisible | OperationHidden, never> =>
  Match.value(command.owner).pipe(
    Match.tag('Anonymous', () => admit(true)),
    Match.tag('Person', (owner) =>
      Match.value(command.principal).pipe(
        Match.tag('Person', (asker) => admit(subjectEquivalence(owner.subject, asker.subject))),
        Match.tag('Anonymous', () => admit(false)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

export const checkOperationVisibility = Workflow.make({
  command: CheckOperationVisibility,
  decision: Schema.Union([OperationVisible, OperationHidden]),
  error: Schema.Never,
  decide: decideVisibility,
})
