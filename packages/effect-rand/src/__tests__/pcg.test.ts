import { describe, expect, it } from '@effect/vitest'
import { Cause, Chunk, Effect, Exit, FastCheck as fc, Layer, Random } from 'effect'
import { dual } from 'effect/Function'
import { make } from '../pcg.js'

const pcgLayer = (seed?: number): Layer.Layer<never> =>
  Layer.unwrapEffect(Effect.map(make(seed), Layer.setRandom))

const drawN = dual<
  (n: number) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Array<A>, E, R>,
  <A, E, R>(n: number, effect: Effect.Effect<A, E, R>) => Effect.Effect<Array<A>, E, R>
>(2, <A, E, R>(n: number, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const out: Array<A> = []
    for (let i = 0; i < n; i++) out.push(yield* effect)
    return out
  }),
)

const expectDieWith = <R>(
  effect: Effect.Effect<unknown, never, R>,
  ...substrings: Array<string>
): Effect.Effect<void, never, R> =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    const cause = Exit.isSuccess(exit) ? Cause.empty : exit.cause
    const defect = Cause.squash(cause)
    const msg = Cause.pretty(cause)
    const missingSubstrings = substrings.filter((s) => !msg.includes(s))

    expect(Exit.isFailure(exit)).toBe(true)
    expect(defect).toBeInstanceOf(RangeError)
    expect(missingSubstrings).toEqual([])
  })

describe('PcgRandomLive', () => {
  it.effect('Should_ProduceIdenticalSequences_When_SameSeedRunTwice', () =>
    Effect.gen(function* () {
      const draw3 = drawN(3, Random.nextInt).pipe(Effect.provide(pcgLayer(42)))
      const a = yield* draw3
      const b = yield* draw3
      expect(a).toEqual(b)
    }),
  )

  describe.concurrent('known-answer vectors (seed=42, canonical PCG-XSH-RR)', () => {
    it.effect('Should_MatchCanonicalSequence_When_DrawingNextInt', () =>
      Effect.gen(function* () {
        expect(yield* drawN(10, Random.nextInt)).toEqual([
          3270867926, 1795671209, 1924641435, 1143034755, 4121910957, 1757328946, 3418829100,
          3589261271, 2062288904, 4279450293,
        ])
      }).pipe(Effect.provide(pcgLayer(42))),
    )

    it.effect('Should_MatchCanonicalSequence_When_DrawingNextBoolean', () =>
      Effect.gen(function* () {
        expect(yield* drawN(10, Random.nextBoolean)).toEqual([
          true,
          false,
          false,
          false,
          true,
          false,
          true,
          true,
          false,
          true,
        ])
      }).pipe(Effect.provide(pcgLayer(42))),
    )

    it.effect('Should_MatchCanonicalSequence_When_DrawingNextIntBetween', () =>
      Effect.gen(function* () {
        expect(yield* drawN(10, Random.nextIntBetween(0, 100))).toEqual([
          26, 9, 35, 55, 57, 46, 0, 71, 4, 93,
        ])
      }).pipe(Effect.provide(pcgLayer(42))),
    )

    it.effect('Should_MatchCanonicalSequence_When_DrawingNextIntBetweenLargeRange', () =>
      Effect.gen(function* () {
        expect(yield* drawN(5, Random.nextIntBetween(0, 2 ** 31 + 1))).toEqual([
          1123384277, 1974427308, 1271345451, 1441777622, 2131966644,
        ])
      }).pipe(Effect.provide(pcgLayer(42))),
    )

    it.effect('Should_MatchCanonicalPermutation_When_ShufflingEightElements', () =>
      Effect.gen(function* () {
        const result = yield* Random.shuffle([0, 1, 2, 3, 4, 5, 6, 7])
        expect(Chunk.toReadonlyArray(result)).toEqual([2, 4, 5, 1, 0, 7, 3, 6])
      }).pipe(Effect.provide(pcgLayer(42))),
    )

    it.effect('Should_MatchCanonicalNextInt_When_DrawingAfterShuffle', () =>
      Effect.gen(function* () {
        yield* Random.shuffle([0, 1, 2, 3, 4, 5, 6, 7])
        expect(yield* Random.nextInt).toBe(3589261271)
      }).pipe(Effect.provide(pcgLayer(42))),
    )

    it.effect('Should_MatchCanonicalSequence_When_DrawingNext', () =>
      Effect.gen(function* () {
        expect(yield* drawN(5, Random.next)).toEqual([
          0.7397302147566239, 0.679392270986327, 0.42125959833146553, 0.9445235243749676,
          0.7304993999658423,
        ])
      }).pipe(Effect.provide(pcgLayer(42))),
    )

    it.effect('Should_MatchCanonicalSequence_When_DrawingNextRange', () =>
      Effect.gen(function* () {
        expect(yield* drawN(5, Random.nextRange(-5, 10))).toEqual([
          6.095953221349358, 5.190884064794906, 1.3188939749719832, 9.167852865624514,
          5.957490999487636,
        ])
      }).pipe(Effect.provide(pcgLayer(42))),
    )
  })

  describe.concurrent('invariants (property-based)', () => {
    it.effect.prop(
      'Should_ReturnValueInRange_When_CallingNextIntBetween',
      [
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 2 ** 30 }),
      ],
      ([min, span, seed]) =>
        Effect.gen(function* () {
          const max = min + span
          const v = yield* Random.nextIntBetween(min, max)
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(min)
          expect(v).toBeLessThan(max)
        }).pipe(Effect.provide(pcgLayer(seed))),
    )

    it.effect.prop(
      'Should_PreserveMultiset_When_Shuffling',
      [
        fc.array(fc.integer(), { minLength: 0, maxLength: 50 }),
        fc.integer({ min: 0, max: 2 ** 30 }),
      ],
      ([elements, seed]) =>
        Effect.gen(function* () {
          const shuffled = Chunk.toReadonlyArray(yield* Random.shuffle(elements))
          expect(shuffled.length).toBe(elements.length)
          const sortedIn = [...elements].sort((x, y) => x - y)
          const sortedOut = [...shuffled].sort((x, y) => x - y)
          expect(sortedOut).toEqual(sortedIn)
        }).pipe(Effect.provide(pcgLayer(seed))),
    )

    it.effect.prop(
      'Should_ReturnUint32_When_DrawingNextInt',
      [fc.integer({ min: 0, max: 2 ** 30 })],
      ([seed]) =>
        Effect.gen(function* () {
          const v = yield* Random.nextInt
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThan(2 ** 32)
        }).pipe(Effect.provide(pcgLayer(seed))),
    )

    it.effect.prop(
      'Should_ReturnValueInUnitInterval_When_DrawingNext',
      [fc.integer({ min: 0, max: 2 ** 30 })],
      ([seed]) =>
        Effect.gen(function* () {
          const v = yield* Random.next
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThan(1)
        }).pipe(Effect.provide(pcgLayer(seed))),
    )

    it.effect.prop(
      'Should_ReturnValueInRange_When_CallingNextRange',
      [
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: 1e-6, max: 1e6, noNaN: true }),
        fc.integer({ min: 0, max: 2 ** 30 }),
      ],
      ([min, span, seed]) =>
        Effect.gen(function* () {
          const max = min + span
          const v = yield* Random.nextRange(min, max)
          expect(v).toBeGreaterThanOrEqual(min)
          expect(v).toBeLessThan(max)
        }).pipe(Effect.provide(pcgLayer(seed))),
    )
  })

  describe.concurrent('edge cases', () => {
    it.effect('Should_ReturnEmpty_When_ShufflingEmptyArray', () =>
      Effect.gen(function* () {
        const result = yield* Random.shuffle([])
        expect(Chunk.toReadonlyArray(result)).toEqual([])
      }).pipe(Effect.provide(pcgLayer(0))),
    )

    it.effect('Should_ReturnSingleton_When_ShufflingOneElement', () =>
      Effect.gen(function* () {
        const result = yield* Random.shuffle([42])
        expect(Chunk.toReadonlyArray(result)).toEqual([42])
      }).pipe(Effect.provide(pcgLayer(0))),
    )

    it.effect('Should_Die_When_NextIntBetweenHasEqualBounds', () =>
      expectDieWith(
        Random.nextIntBetween(5, 5),
        'nextIntBetween',
        'must be greater than',
        '(5)',
      ).pipe(Effect.provide(pcgLayer(0))),
    )

    it.effect('Should_Die_When_NextIntBetweenHasInvertedBounds', () =>
      expectDieWith(
        Random.nextIntBetween(10, 5),
        'nextIntBetween',
        'must be greater than',
        '(5)',
        '(10)',
      ).pipe(Effect.provide(pcgLayer(0))),
    )

    it.effect('Should_Die_When_NextIntBetweenMinIsFloat', () =>
      expectDieWith(Random.nextIntBetween(5.5, 10), 'min and max must be integers').pipe(
        Effect.provide(pcgLayer(0)),
      ),
    )

    it.effect('Should_Die_When_NextIntBetweenMaxIsFloat', () =>
      expectDieWith(Random.nextIntBetween(5, 10.5), 'min and max must be integers').pipe(
        Effect.provide(pcgLayer(0)),
      ),
    )

    it.effect('Should_Die_When_NextIntBetweenRangeExceedsUint32', () =>
      expectDieWith(
        Random.nextIntBetween(0, 2 ** 32 + 1),
        'nextIntBetween',
        'exceeds 2^32',
        String(2 ** 32 + 1),
      ).pipe(Effect.provide(pcgLayer(0))),
    )

    it.effect('Should_NotDie_When_NextIntBetweenRangeEqualsUint32', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(Random.nextIntBetween(0, 2 ** 32))
        expect(Exit.isSuccess(exit)).toBe(true)
        if (Exit.isSuccess(exit)) {
          expect(exit.value).toBeGreaterThanOrEqual(0)
          expect(exit.value).toBeLessThan(2 ** 32)
        }
      }).pipe(Effect.provide(pcgLayer(42))),
    )
  })
})
