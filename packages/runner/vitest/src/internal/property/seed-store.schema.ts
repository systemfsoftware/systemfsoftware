/**
 * @internal The seed store's line grammar (KTD6, R16, R18): one JSON Lines entry per failing run, decoded as a
 * tagged union. A refuted run carries the property's full name plus the parts a generator replay token is rebuilt
 * from; a non-boolean run carries the name, the seed and the run count. The codec a line is read through lives
 * here; the decisions over an entry live in `seed-record.ts`.
 *
 * @since 4.0.0
 */
import * as Schema from 'effect/Schema'
import { ReplayFailureTag, ReplayStep } from '../../replay.schema.js'
import { PropertyRunCount, PropertySeed } from './error.schema.js'

/** @internal */
export const SeedStoreRefuted = Schema.TaggedStruct('Refuted', {
  property: Schema.String,
  seed: PropertySeed,
  attempt: PropertyRunCount,
  size: PropertyRunCount,
  path: Schema.Array(ReplayStep),
  failure: ReplayFailureTag,
})
/** @internal */
export type SeedStoreRefuted = typeof SeedStoreRefuted.Type

/** @internal */
export const SeedStoreNonBoolean = Schema.TaggedStruct('NonBoolean', {
  property: Schema.String,
  seed: PropertySeed,
  runs: PropertyRunCount,
})
/** @internal */
export type SeedStoreNonBoolean = typeof SeedStoreNonBoolean.Type

/** @internal */
export const SeedStoreEntry = Schema.Union([SeedStoreRefuted, SeedStoreNonBoolean])
/** @internal */
export type SeedStoreEntry = typeof SeedStoreEntry.Type

/** @internal */
export const SeedStoreLine = Schema.fromJsonString(SeedStoreEntry)
