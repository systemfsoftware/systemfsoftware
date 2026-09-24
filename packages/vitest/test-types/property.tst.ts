import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'tstyche'
import { it as forkIt } from '../src/mod'

type Sort = (xs: ReadonlyArray<number>) => ReadonlyArray<number>
type SortValues = readonly [ReadonlyArray<number>]

const prop = forkIt.prop
const effectProp = forkIt.effect.prop
const law = forkIt.law

const subject: Sort = (xs) => [...xs].sort((a, b) => a - b)
const oracle: Sort = (xs) => [...xs].reverse().reverse().sort((a, b) => a - b)
const isSorted = (xs: ReadonlyArray<number>): boolean => xs.every((x, i) => i === 0 || (xs[i - 1] ?? x) <= x)

describe('lawful properties (R11-R15)', () => {
  it('accepts the lawful object form with schema arbitraries', () => {
    expect(prop).type.toBeCallableWith(
      'sorts',
      { of: [Schema.Array(Schema.Int)], subject, runs: 100 },
      (s: Sort, [xs]: SortValues) => isSorted(s(xs)),
    )
  })

  it('infers generated values inside holds', () => {
    expect(prop).type.toBeCallableWith(
      'sorts',
      { of: [Schema.Array(Schema.Int)], subject, runs: 100 },
      (s: Sort, values: SortValues) => {
        expect(values).type.toBe<readonly [ReadonlyArray<number>]>()
        return isSorted(s(values[0]))
      },
    )
  })

  it('accepts a record of arbitraries', () => {
    expect(prop).type.toBeCallableWith(
      'sorts',
      { of: { list: Schema.Array(Schema.Int) }, subject, runs: 50 },
      (s: Sort, values: { readonly list: ReadonlyArray<number> }) => {
        expect(values).type.toBe<{ readonly list: ReadonlyArray<number> }>()
        return isSorted(s(values.list))
      },
    )
  })

  it('accepts coverage classes over the generated values', () => {
    expect(prop).type.toBeCallableWith(
      'sorts',
      {
        of: [Schema.Array(Schema.Int)],
        subject,
        runs: 400,
        cover: { singletons: [(xs: ReadonlyArray<number>) => xs.length === 1, 0.9] },
      },
      (s: Sort, [xs]: SortValues) => isSorted(s(xs)),
    )
  })

  it('accepts Effect<boolean> verdicts on it.effect.prop', () => {
    expect(effectProp).type.toBeCallableWith(
      'sorts',
      { of: [Schema.Array(Schema.Int)], subject, runs: 100 },
      (s: Sort, [xs]: SortValues) => Effect.succeed(isSorted(s(xs))),
    )
  })

  it('requires runs in the spec', () => {
    expect(prop).type.not.toBeCallableWith(
      'sorts',
      { of: [Schema.Array(Schema.Int)], subject },
      (s: Sort, [xs]: SortValues) => isSorted(s(xs)),
    )
    expect(prop).type.not.toBeCallableWith(
      'sorts',
      { of: [Schema.Array(Schema.Int)], subject, runs: 0 },
      (s: Sort, [xs]: SortValues) => isSorted(s(xs)),
    )
    expect(prop).type.not.toBeCallableWith(
      'sorts',
      { of: [Schema.Array(Schema.Int)], subject, runs: -1 },
      (s: Sort, [xs]: SortValues) => isSorted(s(xs)),
    )
    expect(prop).type.not.toBeCallableWith(
      'sorts',
      { of: [Schema.Array(Schema.Int)], subject, runs: 1.5 },
      (s: Sort, [xs]: SortValues) => isSorted(s(xs)),
    )
    expect(prop).type.toBeCallableWith(
      'sorts',
      { of: [Schema.Array(Schema.Int)], subject, runs: 1 },
      (s: Sort, [xs]: SortValues) => isSorted(s(xs)),
    )
  })

  it('refuses the positional form with the R15 rewrite', () => {
    expect(prop).type.not.toBeCallableWith(
      'sorts',
      [Schema.Array(Schema.Int)],
      (xs: ReadonlyArray<number>) => isSorted(xs),
    )
    expect(effectProp).type.not.toBeCallableWith(
      'sorts',
      [Schema.Array(Schema.Int)],
      (xs: ReadonlyArray<number>) => Effect.succeed(isSorted(xs)),
    )
  })

  it('refuses a non-boolean verdict on the sync lane', () => {
    expect(prop).type.not.toBeCallableWith(
      'sorts',
      { of: [Schema.Array(Schema.Int)], subject, runs: 100 },
      (s: Sort, [xs]: SortValues) => Effect.succeed(isSorted(s(xs))),
    )
  })
})

describe('law kinds (R13)', () => {
  it('accepts a model law against an independent oracle', () => {
    expect(law.model).type.toBeCallableWith(
      'agrees with insertion sort',
      { of: [Schema.Array(Schema.Int)], subject, runs: 100 },
      oracle,
    )
  })

  it('refuses a model oracle whose output the subject does not produce', () => {
    expect(law.model).type.not.toBeCallableWith(
      'agrees with insertion sort',
      { of: [Schema.Array(Schema.Int)], subject, runs: 100 },
      (xs: ReadonlyArray<number>) => xs.join(','),
    )
  })

  it('accepts a model law subject with no annotation on the expression under test', () => {
    expect(law.model).type.toBeCallableWith(
      'agrees with insertion sort',
      {
        of: [Schema.Array(Schema.Int)],
        subject: (xs: ReadonlyArray<number>) => [...xs].sort((a, b) => a - b),
        runs: 100,
      },
      oracle,
    )
  })

  it('accepts the exempt kinds with no holds', () => {
    expect(law.idempotent).type.toBeCallableWith('sorting twice changes nothing', {
      of: [Schema.Array(Schema.Int)],
      subject,
      runs: 50,
    })
    expect(law.deterministic).type.toBeCallableWith('one input, one output', {
      of: [Schema.Array(Schema.Int)],
      subject,
      runs: 50,
    })
  })

  it('accepts a metamorphic law with an input transform', () => {
    expect(law.metamorphic).type.toBeCallableWith(
      'reversing twice is the identity',
      { of: [Schema.Array(Schema.Int)], subject, runs: 100 },
      {
        transform: (xs: ReadonlyArray<number>): SortValues => [[...xs].reverse()] as const,
        relate: (original: ReadonlyArray<number>, transformed: ReadonlyArray<number>) =>
          isSorted(transformed) === isSorted(original),
      },
    )
  })

  it('accepts a roundTrip law whose decode returns the generated values', () => {
    expect(law.roundTrip).type.toBeCallableWith(
      'decode encodes',
      { of: [Schema.Array(Schema.Int)], subject, runs: 100 },
      (encoded: ReadonlyArray<number>): SortValues => [encoded],
    )
  })

  it('accepts an invariant law given the subject output and the values', () => {
    expect(law.invariant).type.toBeCallableWith(
      'sorted output',
      { of: [Schema.Array(Schema.Int)], subject, runs: 100 },
      (output: ReadonlyArray<number>) => isSorted(output),
    )
  })
})
