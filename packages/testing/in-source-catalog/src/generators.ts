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
 * A `fc.constant` of one point is a literal list in arbitrary clothing: pin
 * every independent field with its own generator.
 */
export const region = <A>(refusingInputs: Arbitrary<A>): RefuseHomes<A> => mintRefuseHomes(refusingInputs)

export const refuseHomes = {
  invalidSocketPath: homeFromStemSuffix('\u0000'),
  sshParentConflict: homeFromStemSuffix('/.ssh/id_ed25519'),
  reservedEnvFile: homeFromStemSuffix('/secrets.env'),
  quadletDir: homeFromStemSuffix('/quadlets/unit.container'),
  region,
} as const
