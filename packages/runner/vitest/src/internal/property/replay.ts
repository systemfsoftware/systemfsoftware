/**
 * The property replay channel (KTD5, R9-R12): the text a property failure carries, the generator replay token a
 * refuted entry rebuilds, and the entry the engine selects for a property's identity hash.
 *
 * The token `effect`'s falsification runner writes is decoded here through its codec — never hand-parsed — into the
 * parts a refuted entry names, and rebuilt from them the way `makeReplay` reads them back.
 *
 * @since 4.0.0
 */
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import {
  type PlainReplayFieldsList,
  plainReplayText,
  plainReplayTexts,
  type PropertyReplay,
  type RefutedPropertyReplay,
  refutedReplayText,
  type ReplayChannel,
} from '../../replay.schema.js'
import { ReplayToken } from './replay.schema.js'

const NUMERIC_SEED = 0

/** @internal */
export interface ReplayIdentity {
  readonly property: number
  readonly seed: number
  readonly runs: number
}

/** @internal */
export interface RefutedReplayIdentity extends ReplayIdentity {
  readonly token: string
}

/** @internal */
export interface ReplaySelection {
  readonly channel: ReplayChannel
  readonly hash: number
}

/** @internal */
export const tokenOfReplay = (entry: RefutedPropertyReplay): string =>
  JSON.stringify([NUMERIC_SEED, `${entry.seed}`, entry.attempt, entry.size, entry.path, entry.failure])

/** @internal */
export const refutedReplayTextOf = (identity: RefutedReplayIdentity): string | undefined =>
  Option.getOrUndefined(
    Option.map(
      Schema.decodeOption(ReplayToken)(identity.token),
      (decoded) =>
        refutedReplayText({
          property: identity.property,
          seed: identity.seed,
          runs: identity.runs,
          attempt: decoded[2],
          size: decoded[3],
          path: decoded[4],
          failure: decoded[5],
        }),
    ),
  )

/** @internal */
export const plainReplayTextOf = (identity: ReplayIdentity): string => plainReplayText(identity)

/** @internal */
export const plainReplayEntriesText = (entries: PlainReplayFieldsList): string => plainReplayTexts(entries)

const isEntries = (channel: ReplayChannel): channel is ReadonlyArray<PropertyReplay> => Array.isArray(channel)

/** @internal */
export const selectReplayEntry = (selection: ReplaySelection): PropertyReplay | undefined =>
  isEntries(selection.channel) ? selection.channel.find((entry) => entry.property === selection.hash) : undefined
