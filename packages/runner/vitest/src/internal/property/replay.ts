/**
 * The replay value a property counterexample carries (KTD5): the seed and the shrink path the generator recorded,
 * read off the failure value and out of the check result as data. Nothing here reads a failure message.
 *
 * The token `effect`'s falsification runner writes is decoded here — never hand-parsed — into the seed and path R6
 * prints.
 *
 * @since 4.0.0
 */
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { ReplayValue } from '../failure-record.js'
import { PropertyRefuted, PropertyReplay } from './error.schema.js'
import { ReplayToken } from './replay.schema.js'

type Opaque<A = unknown> = A

/** @internal */
export type PropertyReplayValue = typeof PropertyReplay.Type

/** The token's leading kind that names a numeric seed. */
const NUMERIC_SEED = 0

type Decoded = typeof ReplayToken.Type

const numericSeedOf = (token: Decoded): number | undefined => token[0] === NUMERIC_SEED ? Number(token[1]) : undefined

const replayOf = (token: Decoded): Option.Option<PropertyReplayValue> =>
  Option.map(Option.fromNullishOr(numericSeedOf(token)), (seed) => ({ seed, path: token[4] }))

/** @internal */
export const replayOfToken = (replay: string): PropertyReplayValue | undefined =>
  Option.getOrUndefined(Option.flatMap(Schema.decodeOption(ReplayToken)(replay), replayOf))

const refutationOf = (value: Opaque): PropertyRefuted | undefined =>
  Schema.is(PropertyRefuted)(value) ? value : undefined

/** @internal */
export const replayOfFailure = (value: Opaque): ReplayValue | undefined =>
  Option.getOrUndefined(
    Option.flatMap(Option.fromNullishOr(refutationOf(value)), (failure) => Option.fromNullishOr(failure.replay)),
  )
