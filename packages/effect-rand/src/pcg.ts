/**
 * @module pcg
 *
 * PCG-XSH-RR (PCG32) pseudo-random number generator as an Effect `Random` service.
 *
 * Implements Melissa O'Neill's canonical 32-bit PCG algorithm — output matches
 * the reference `pcg_basic.c` byte-for-byte at fixed seeds. Replaces Effect's
 * default `Random`, which has documented bias (see Effect issue #6184):
 *
 * - `nextIntBetween` is unbiased via Lemire rejection sampling.
 * - `shuffle` is unbiased Fisher-Yates routed through `nextIntBetween`.
 * - `next` is a 53-bit double composed from two uint32 draws.
 * - `nextBoolean` reads the top bit of the uint32 output.
 *
 * See README.md for usage and AGENTS.md for contribution constraints.
 *
 * @see {@link https://www.pcg-random.org/paper.html} PCG paper (O'Neill, 2014)
 * @see {@link https://www.pcg-random.org/download.html} `pcg_basic.c` reference
 * @see {@link https://arxiv.org/abs/1805.10941} Lemire (2018), rejection sampling
 * @see {@link https://github.com/Effect-TS/effect/issues/6184} bias in Effect's default Random
 */
/// <reference types="vitest/importMeta" />
import { Chunk, Clock, Effect, Ref } from 'effect'
import * as RandomType from 'effect/Random'

const PCG_MULT = 6364136223846793005n
const PCG_DEFAULT_STREAM = 721347520444481703n
const MASK_64 = (1n << 64n) - 1n
const MASK_32 = (1n << 32n) - 1n
const MASK_26 = 0x03ffffff
const MASK_27 = 0x07ffffff

type PcgState = readonly [state: bigint, inc: bigint]

const rotr32 = (x: bigint, r: bigint): bigint => {
  const rr = r & 31n
  return ((x >> rr) | (x << ((32n - rr) & 31n))) & MASK_32
}

const next = (s: PcgState): [output: bigint, newState: PcgState] => {
  const [state, inc] = s
  const newState: PcgState = [(state * PCG_MULT + inc) & MASK_64, inc]
  const xorshifted = (((state >> 18n) ^ state) >> 27n) & MASK_32
  const rot = state >> 59n
  return [rotr32(xorshifted, rot), newState]
}

const acceptDraw = (n: number, threshold: number): boolean => n >= threshold

const seedPcg = (seed: bigint, stream: bigint = PCG_DEFAULT_STREAM): PcgState => {
  const inc = ((stream << 1n) | 1n) & MASK_64
  let s: PcgState = [0n, inc]
  s = next(s)[1]
  s = [(s[0] + (seed & MASK_64)) & MASK_64, inc]
  s = next(s)[1]
  return s
}

export const make = (seed?: number): Effect.Effect<RandomType.Random> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const state = yield* Ref.make<PcgState>(seedPcg(BigInt(seed ?? now)))
    const nextUint32 = Effect.map(Ref.modify(state, next), (n) => Number(n))

    const nextNumber = Effect.gen(function* () {
      const hi = (yield* nextUint32) & MASK_26
      const lo = (yield* nextUint32) & MASK_27
      return (hi * 2 ** 27 + lo) / 2 ** 53
    })

    const nextBoolean = Effect.map(nextUint32, (n) => n >>> 31 === 1)

    const nextIntBetween = Effect.fnUntraced(function* (min: number, max: number) {
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        return yield* Effect.die(new RangeError(`nextIntBetween: min and max must be integers`))
      }
      const range = max - min
      if (range <= 0) {
        return yield* Effect.die(
          new RangeError(`nextIntBetween: max (${max}) must be greater than min (${min})`),
        )
      }
      if (range > 2 ** 32) {
        return yield* Effect.die(new RangeError(`nextIntBetween: range ${range} exceeds 2^32`))
      }
      const threshold = ((-range >>> 0) % range) >>> 0
      while (true) {
        const n = yield* nextUint32
        if (acceptDraw(n, threshold)) return ((n % range) >>> 0) + min
      }
    })

    const nextRange = Effect.fnUntraced(function* (min: number, max: number) {
      const n = yield* nextNumber
      return (max - min) * n + min
    })

    const shuffle = Effect.fnUntraced(function* <A>(elements: Iterable<A>) {
      const buffer = Array.from(elements)
      for (let i = buffer.length - 1; i > 0; i--) {
        const j = yield* nextIntBetween(0, i + 1)
        const tmp = buffer[i]!
        buffer[i] = buffer[j]!
        buffer[j] = tmp
      }
      return Chunk.fromIterable(buffer)
    })

    return RandomType.Random.of({
      [RandomType.RandomTypeId]: RandomType.RandomTypeId,
      next: nextNumber,
      nextBoolean,
      nextInt: nextUint32,
      nextRange,
      nextIntBetween,
      shuffle,
    })
  })

// Stryker disable all
if (import.meta.vitest) {
  const { describe, it, expect } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect')

  const PCG_INC = 0x14057b7ef767814fn
  const anyUint64 = fc.bigInt({ min: 0n, max: (1n << 64n) - 1n })

  const drawNext = (initial: PcgState, count: number): Array<bigint> => {
    let s = initial
    const out: Array<bigint> = []
    for (let i = 0; i < count; i++) {
      const [o, ns] = next(s)
      out.push(o)
      s = ns
    }
    return out
  }

  describe.concurrent('next (PCG-XSH-RR state transition)', () => {
    it.each<[scenario: string, initial: PcgState, expected: Array<bigint>]>([
      [
        'StateIsZeroAndIncIsOne',
        [0n, 1n],
        [0x00000000n, 0x00000000n, 0xe4c14788n, 0x379c6516n, 0x5c4ab3bbn],
      ],
      [
        'SeededWith42',
        [0x977afd8015414a94n, PCG_INC],
        [0xc2f57bd6n, 0x6b07c4a9n, 0x72b7b29bn, 0x44215383n, 0xf5af5eadn],
      ],
      [
        'StateIsLargeUint64',
        [0x7fffffffffffffffn, PCG_INC],
        [0x0001fff8n, 0x52ece26fn, 0xe8d4ac82n, 0xff20d57bn, 0x68dadfd3n],
      ],
    ])('Should_MatchReferenceOutput_When_%s', (_, initial, expected) => {
      expect(drawNext(initial, 5)).toEqual(expected)
    })

    it.prop('Should_ReturnUint32Output_When_AnyValidState', [anyUint64], ([state]) => {
      const [out] = next([state, PCG_INC])
      return out >= 0n && out < 1n << 32n
    })

    it.prop('Should_AdvanceStateWithinUint64_When_AnyValidState', [anyUint64], ([state]) => {
      const [, [newState]] = next([state, PCG_INC])
      return newState >= 0n && newState < 1n << 64n
    })

    it.prop('Should_ReturnSameOutput_When_CalledTwiceWithSameState', [anyUint64], ([state]) => {
      const a = next([state, PCG_INC])
      const b = next([state, PCG_INC])
      return a[0] === b[0] && a[1][0] === b[1][0]
    })
  })

  describe.concurrent('acceptDraw (rejection sampling boundary)', () => {
    it.each<[scenario: string, n: number, threshold: number, expected: boolean]>([
      ['DrawEqualsThreshold', 5, 5, true],
      ['DrawBelowThreshold', 4, 5, false],
      ['DrawAboveThreshold', 6, 5, true],
      ['DrawEqualsZeroThreshold', 0, 0, true],
    ])('Should_ReturnExpected_When_%s', (_, n, threshold, expected) => {
      expect(acceptDraw(n, threshold)).toBe(expected)
    })
  })

  describe.concurrent('seedPcg (pcg32_srandom_r protocol)', () => {
    it.each<[scenario: string, seed: bigint, expected: PcgState]>([
      ['SeedIsZero', 0n, [0x1a08ee1184ba6d32n, PCG_INC]],
      ['SeedIs42', 42n, [0x977afd8015414a94n, PCG_INC]],
      ['SeedIsLargeUint64', 9223372036854775808n, [0x9a08ee1184ba6d32n, PCG_INC]],
    ])('Should_MatchReferenceInitialState_When_%s', (_, seed, expected) => {
      expect(seedPcg(seed)).toEqual(expected)
    })

    it.prop(
      'Should_ProduceOddInc_When_AnyStreamValue',
      [anyUint64],
      ([stream]) => (seedPcg(0n, stream)[1] & 1n) === 1n,
    )
  })
}
