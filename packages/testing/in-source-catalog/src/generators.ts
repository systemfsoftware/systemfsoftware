import { FastCheck as fc } from 'effect/testing'
import { type RefuseHomes } from './brand.js'
import { mintRefuseHomes } from './internal/mint.js'

const homeFromStemSuffix = (suffix: string) => <A>(home: (path: string) => A): RefuseHomes<A> =>
  mintRefuseHomes(fc.string({ minLength: 1 }).map((stem) => `${stem}${suffix}`).map(home))

export const refuseHomes = {
  invalidSocketPath: homeFromStemSuffix('\u0000'),
  sshParentConflict: homeFromStemSuffix('/.ssh/id_ed25519'),
  reservedEnvFile: homeFromStemSuffix('/secrets.env'),
  quadletDir: homeFromStemSuffix('/quadlets/unit.container'),
} as const
