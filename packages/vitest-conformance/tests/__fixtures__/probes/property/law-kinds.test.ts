import { it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const sorted = (xs: ReadonlyArray<number>): ReadonlyArray<number> => [...xs].sort((a, b) => a - b)
const reverse = (xs: ReadonlyArray<number>): ReadonlyArray<number> => [...xs].reverse()

const stringify = (n: number): string => `${n}`
const decodeInt = (encoded: string): readonly [number] => [Number(encoded)]

const firstOnly = (xs: ReadonlyArray<number>): ReadonlyArray<number> => xs.length === 0 ? [] : [xs[0] ?? 0]
const shifted = (n: number): string => `${n + 1}`
const grown = (xs: ReadonlyArray<number>): ReadonlyArray<number> => [...xs, 0]

it.law.metamorphic(
  'Should_AgreeWithItself_When_TheInputOrderIsReversed',
  { of: [Schema.Array(Schema.Int)], subject: sorted, runs: 50 },
  { transform: (xs: ReadonlyArray<number>) => [reverse(xs)] as const },
)

it.law.roundTrip(
  'Should_RoundTrip_When_TheTextIsDecodedBack',
  { of: [Schema.Int], subject: stringify, runs: 50 },
  decodeInt,
)

it.law.invariant(
  'Should_KeepTheLength_When_TheInputIsSorted',
  { of: [Schema.Array(Schema.Int)], subject: sorted, runs: 50 },
  (out: ReadonlyArray<number>, xs) => out.length === xs.length,
)

it.law.metamorphic(
  'Should_Falsify_When_TheSubjectKeepsOnlyTheFirstElement',
  { of: [Schema.Array(Schema.Int)], subject: firstOnly, runs: 50 },
  { transform: (xs: ReadonlyArray<number>) => [reverse(xs)] as const },
)

it.law.roundTrip(
  'Should_Falsify_When_TheSubjectEncodesTheNextNumber',
  { of: [Schema.Int], subject: shifted, runs: 50 },
  decodeInt,
)

it.law.invariant(
  'Should_Falsify_When_TheSubjectAppendsAnElement',
  { of: [Schema.Array(Schema.Int)], subject: grown, runs: 50 },
  (out: ReadonlyArray<number>, xs) => out.length === xs.length,
)
