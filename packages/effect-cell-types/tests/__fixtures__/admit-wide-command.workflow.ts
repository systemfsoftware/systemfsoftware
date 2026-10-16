import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { DecisionError } from './Decision.fixture.js'

const WideTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/Wide')
type WideTypeId = typeof WideTypeId

export class WideCommand extends S.TaggedClass<WideCommand>()('WideCommand', {
  n: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { n: 'tests.wide.n' } as const
}

export class WideOne extends S.TaggedClass<WideOne>()('WideOne', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideTwo extends S.TaggedClass<WideTwo>()('WideTwo', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideThree extends S.TaggedClass<WideThree>()('WideThree', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideFour extends S.TaggedClass<WideFour>()('WideFour', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideFive extends S.TaggedClass<WideFive>()('WideFive', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideSix extends S.TaggedClass<WideSix>()('WideSix', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideSeven extends S.TaggedClass<WideSeven>()('WideSeven', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideEight extends S.TaggedClass<WideEight>()('WideEight', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideNine extends S.TaggedClass<WideNine>()('WideNine', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideTen extends S.TaggedClass<WideTen>()('WideTen', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideEleven extends S.TaggedClass<WideEleven>()('WideEleven', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideTwelve extends S.TaggedClass<WideTwelve>()('WideTwelve', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}

export const WideDecision = S.Union([
  WideOne,
  WideTwo,
  WideThree,
  WideFour,
  WideFive,
  WideSix,
  WideSeven,
  WideEight,
  WideNine,
  WideTen,
  WideEleven,
  WideTwelve,
])

export const admitWideCommand = Workflow.make({
  command: WideCommand,
  decision: WideDecision,
  error: DecisionError,
  decide: (command: WideCommand): Result.Result<WideOne, DecisionError> =>
    Result.succeed(new WideOne({ n: command.n })),
})
