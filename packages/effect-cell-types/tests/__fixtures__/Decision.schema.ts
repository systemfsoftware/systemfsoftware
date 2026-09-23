import * as S from 'effect/Schema'

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/Decision')
type DecisionTypeId = typeof DecisionTypeId

export class DecisionOne extends S.TaggedClass<DecisionOne>()('DecisionOne', {
  value: S.Int,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class DecisionTwo extends S.TaggedClass<DecisionTwo>()('DecisionTwo', {
  reason: S.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class LoneDecision extends S.TaggedClass<LoneDecision>()('LoneDecision', {}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class DecisionError extends S.TaggedError<DecisionError>()('DecisionError', {
  why: S.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export const Decision = S.Union([DecisionOne, DecisionTwo])

export const DecisionEvents = S.Array(Decision)

export const SingleEventList = S.Array(DecisionOne)

const WideTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/Wide')
type WideTypeId = typeof WideTypeId

/** Twelve tagged variants: the handler-record inference the surface must hold at scale. */
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
