import { it } from '@systemfsoftware/vitest'
import { type JsonValue, witnessOf } from '@systemfsoftware/vitest/failure'

type WitnessInput = JsonValue | object | symbol | bigint | undefined

interface WitnessCase {
  readonly value: WitnessInput
  readonly rendered: string
  readonly json: JsonValue
}

const sampleFunction = (): void => {}

const CASES: ReadonlyArray<WitnessCase> = [
  { value: {}, rendered: '{}', json: {} },
  { value: [], rendered: '[]', json: [] },
  { value: { _tag: 'Some', value: 1 }, rendered: 'Some', json: { _tag: 'Some', value: 1 } },
  { value: 'a', rendered: '"a"', json: 'a' },
  { value: undefined, rendered: 'undefined', json: { _kind: 'undefined' } },
  { value: sampleFunction, rendered: 'function', json: { _kind: 'function', name: 'sampleFunction' } },
]

interface SelfLoop {
  self?: SelfLoop
}

const selfLoop = (): SelfLoop => {
  const loop: SelfLoop = {}
  loop.self = loop
  return loop
}

it('Should_RenderEveryWitnessText_When_TheValuesDiffer', function*({ expect }) {
  yield* expect(CASES.map(({ value }) => witnessOf(value).rendered)).toEqual(CASES.map(({ rendered }) => rendered))
})

it('Should_ProjectEveryWitnessValue_When_TheValuesDiffer', function*({ expect }) {
  yield* expect(CASES.map(({ value }) => witnessOf(value).value)).toEqual(CASES.map(({ json }) => json))
})

it('Should_RenderDistinctTextAndNeverTheObjectString_When_TheValuesDiffer', function*({ expect }) {
  const rendered = CASES.map(({ value }) => witnessOf(value).rendered)
  yield* expect({
    distinct: new Set(rendered).size,
    objectStrings: rendered.filter((text) => text.includes('[object Object]')),
  }).toEqual({ distinct: CASES.length, objectStrings: [] })
})

it('Should_ProjectTheNestedStructure_When_TheWitnessIsNested', function*({ expect }) {
  yield* expect(witnessOf({ a: [1, { b: undefined }] })).toEqual({
    rendered: '{"a":[1,{"b":undefined}]}',
    value: { a: [1, { b: { _kind: 'undefined' } }] },
  })
})

const MARKS: ReadonlyArray<readonly [WitnessInput, JsonValue]> = [
  [Symbol('s'), { _kind: 'symbol', description: 's' }],
  [1n, { _kind: 'bigint', value: '1' }],
  [Number.NaN, { _kind: 'number', value: 'NaN' }],
  [Number.POSITIVE_INFINITY, { _kind: 'number', value: 'Infinity' }],
  [Number.NEGATIVE_INFINITY, { _kind: 'number', value: '-Infinity' }],
  [selfLoop(), { self: { _kind: 'circular' } }],
]

it('Should_MarkEveryValueJsonCannotCarry_When_TheWitnessHoldsOne', function*({ expect }) {
  yield* expect(MARKS.map(([value]) => witnessOf(value).value)).toEqual(MARKS.map(([, json]) => json))
})
