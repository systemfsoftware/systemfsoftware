import { FastCheck as fc } from 'effect/testing'
import { mintRefuseHomes, type RefuseHomes } from './brand.js'

export const refuseHomes = {
  invalidSocketPath: <A>(home: (socketPath: string) => A): RefuseHomes<A> =>
    mintRefuseHomes(fc.string({ minLength: 1 }).map((stem) => `${stem}\u0000`).map(home)),

  sshParentConflict: <A>(home: (sshTreePath: string) => A): RefuseHomes<A> =>
    mintRefuseHomes(fc.string({ minLength: 1 }).map((stem) => `${stem}/.ssh/id_ed25519`).map(home)),

  reservedEnvFile: <A>(home: (envFilePath: string) => A): RefuseHomes<A> =>
    mintRefuseHomes(fc.string({ minLength: 1 }).map((stem) => `${stem}/secrets.env`).map(home)),

  quadletDir: <A>(home: (quadletPath: string) => A): RefuseHomes<A> =>
    mintRefuseHomes(fc.string({ minLength: 1 }).map((stem) => `${stem}/quadlets/unit.container`).map(home)),
} as const
