import { FastCheck as fc } from 'effect/testing'
import type { Arbitrary } from 'effect/testing/FastCheck'
import { type RefuseHomes } from './brand.js'
import { mintRefuseHomes } from './internal/mint.js'

const homeFromStemSuffix = (suffix: string) => <A>(home: (path: string) => A): RefuseHomes<A> =>
  mintRefuseHomes(fc.string({ minLength: 1 }).map((stem) => `${stem}${suffix}`).map(home))

/**
 * A caller-declared refusal region: an arbitrary over the inputs that must
 * refuse, quantified over every free dimension of the command. The library
 * cannot know a domain's refusing shape — it owns the quantification, the
 * brand, and the detection law; the caller owns only which region refuses.
 * Registration rejects a degenerate arbitrary: 8 samples producing fewer
 * than 2 distinct values throws.
 */
export const region = <A>(refusingInputs: Arbitrary<A>): RefuseHomes<A> => {
  const samples = fc.sample(refusingInputs, { numRuns: 8 })
  if (new Set(samples.map((sample) => fc.stringify(sample))).size < 2) {
    throw new Error(
      'region(...) received a degenerate arbitrary: 8 samples produced <2 distinct values; a refusal region must quantify',
    )
  }
  return mintRefuseHomes(refusingInputs)
}

export const refuseHomes = {
  reservedEnvFile: homeFromStemSuffix('/secrets.env'),
  region,
} as const
