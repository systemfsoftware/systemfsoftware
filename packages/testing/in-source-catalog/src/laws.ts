import { mintPublishedCases, type PublishedCase, type PublishedCases, type RefuseHomes } from './brand.js'
import { refuseHomes } from './generators.js'

export interface LawsSpec<A, R> {
  readonly id: string
  readonly run: (input: A) => R
  readonly reserved: RefuseHomes<A>
  readonly refused: (result: R) => boolean
  readonly published?: PublishedCases<A, R> | undefined
  readonly inverse?: ((result: R) => A) | undefined
}

export const contract = <A, R>(cases: readonly PublishedCase<A, R>[]): PublishedCases<A, R> => mintPublishedCases(cases)

// Static runner imports cannot work here: the runner must exist only where the
// guard is truthy, so the published module graph stays vitest-free.
export const laws = async <A, R>(spec: LawsSpec<A, R>): Promise<void> => {
  const { it } = await import('@effect/vitest')
  const { expect } = await import('vitest')
  const { id, run, reserved, refused, published, inverse } = spec
  if (inverse !== undefined && published === undefined) {
    throw new Error(
      `laws(${id}): an inverse is only licensed beside a published contract — nothing would pin the round-trip`,
    )
  }

  it.prop(`∀${id}_refuses_reserved`, [reserved], ([input]) => refused(run(input)))

  for (const testCase of published?.cases ?? []) {
    it(`${id}_publishes_${testCase.label}`, () => {
      const result = run(testCase.input)
      expect(refused(result)).toBe(false)
      expect(testCase.project(result)).toStrictEqual(testCase.expect)
    })
  }

  const inverses: ReadonlyArray<(result: R) => A> = inverse === undefined ? [] : [inverse]
  for (const roundTrip of inverses) {
    for (const testCase of published?.cases ?? []) {
      it(`${id}_round_trips_${testCase.label}`, () => {
        const result = run(testCase.input)
        const again = run(roundTrip(result))
        expect(refused(again)).toBe(false)
        expect(testCase.project(again)).toStrictEqual(testCase.project(result))
      })
    }
  }
}

export const catalog = { laws, contract, refuseHomes } as const
