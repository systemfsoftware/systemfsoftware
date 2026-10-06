import type { OptIn, OptIns } from '@systemfsoftware/opt-in'
import { Array as Arr } from 'effect'
import type { OptInWithPackage } from './classify.js'
import { DeclaredGrant, type Entry } from './Entry.schema.js'

export interface PackageOptIns {
  readonly package: string
  readonly optIns: OptIns
}

export const grantEntries = (input: PackageOptIns): ReadonlyArray<Entry> =>
  Arr.map(
    input.optIns,
    (optIn: OptIn) =>
      DeclaredGrant.make({
        package: input.package,
        name: optIn.name,
        reason: optIn.reason,
        owner: optIn.owner,
        variant: optIn.grant._tag,
      }),
  )

export const optInsWithPackage = (input: PackageOptIns): ReadonlyArray<OptInWithPackage> =>
  Arr.map(input.optIns, (optIn) => ({ package: input.package, optIn }))
