import * as Function from 'effect/Function'
import type { TestIdentity } from '../failure-record.js'

const FNV_OFFSET_BASIS = 2166136261
const FNV_PRIME = 16777619

const utf8 = new TextEncoder()

const PART_SEPARATOR = '\u0000'

/** @internal */
export const fnv1a32 = (text: string): number =>
  utf8.encode(text).reduce((hash, byte) => Math.imul(hash ^ byte, FNV_PRIME), FNV_OFFSET_BASIS) >>> 0

const identityParts = (identity: TestIdentity): ReadonlyArray<string> => [
  identity.package,
  identity.file,
  identity.name,
]

/** @internal */
export const identitySeed: {
  (salt: number | string, identity: TestIdentity): number
  (identity: TestIdentity): (salt: number | string) => number
} = Function.dual(
  2,
  (salt: number | string, identity: TestIdentity): number =>
    fnv1a32([String(salt), ...identityParts(identity)].join(PART_SEPARATOR)),
)

/** @internal */
export const identityHash = (identity: TestIdentity): number => fnv1a32(identityParts(identity).join(PART_SEPARATOR))

/** @internal */
export const topUpSeed: {
  (seed: number, drawn: number): number
  (drawn: number): (seed: number) => number
} = Function.dual(2, (seed: number, drawn: number): number => fnv1a32(`${seed}${PART_SEPARATOR}${drawn}`))

/** @internal */
export interface SeedResolution {
  readonly own: string | number | undefined
  readonly provided: string | number | undefined
  readonly identity: TestIdentity
  readonly fresh: number
}

const ownSeed = (seed: string | number): number => typeof seed === 'number' ? seed : fnv1a32(seed)

const providedSeed = (input: SeedResolution): number | undefined =>
  input.provided === undefined ? undefined : identitySeed(input.provided, input.identity)

const saltOrProvided = (input: SeedResolution): number | undefined =>
  input.own === undefined ? providedSeed(input) : ownSeed(input.own)

/** @internal */
export const resolveSeed = (input: SeedResolution): number => saltOrProvided(input) ?? input.fresh
