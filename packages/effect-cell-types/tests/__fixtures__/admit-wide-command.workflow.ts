import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { DecisionError } from './Decision.fixture.js'

const WideTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/Wide')
type WideTypeId = typeof WideTypeId

export class WideCommand extends S.TaggedClass<WideCommand, { readonly brand: unique symbol }>()('WideCommand', {
  n: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { n: 'tests.wide.n' } as const
}

export class WideOne extends S.TaggedClass<WideOne, { readonly brand: unique symbol }>()('WideOne', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideTwo extends S.TaggedClass<WideTwo, { readonly brand: unique symbol }>()('WideTwo', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideThree
  extends S.TaggedClass<WideThree, { readonly brand: unique symbol }>()('WideThree', { n: S.Int })
{
  readonly [WideTypeId] = WideTypeId
}
export class WideFour extends S.TaggedClass<WideFour, { readonly brand: unique symbol }>()('WideFour', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideFive extends S.TaggedClass<WideFive, { readonly brand: unique symbol }>()('WideFive', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideSix extends S.TaggedClass<WideSix, { readonly brand: unique symbol }>()('WideSix', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideSeven
  extends S.TaggedClass<WideSeven, { readonly brand: unique symbol }>()('WideSeven', { n: S.Int })
{
  readonly [WideTypeId] = WideTypeId
}
export class WideEight
  extends S.TaggedClass<WideEight, { readonly brand: unique symbol }>()('WideEight', { n: S.Int })
{
  readonly [WideTypeId] = WideTypeId
}
export class WideNine extends S.TaggedClass<WideNine, { readonly brand: unique symbol }>()('WideNine', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideTen extends S.TaggedClass<WideTen, { readonly brand: unique symbol }>()('WideTen', { n: S.Int }) {
  readonly [WideTypeId] = WideTypeId
}
export class WideEleven
  extends S.TaggedClass<WideEleven, { readonly brand: unique symbol }>()('WideEleven', { n: S.Int })
{
  readonly [WideTypeId] = WideTypeId
}
export class WideTwelve
  extends S.TaggedClass<WideTwelve, { readonly brand: unique symbol }>()('WideTwelve', { n: S.Int })
{
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
