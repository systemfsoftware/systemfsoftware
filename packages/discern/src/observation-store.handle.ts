import { Effect, Match, Option, Result, Schema } from 'effect'
import * as MutableRef from 'effect/MutableRef'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import {
  MalformedObservationSnapshotError,
  Observation,
  Observations,
  type ObservationSnapshotRefused,
  SnapshotVersion,
  UnsupportedObservationFormatError,
} from './Observation.schema.js'

export const TypeId = Symbol.for('@systemfsoftware/discern/ObservationStore')
export type TypeId = typeof TypeId

export interface ObservationStore extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly get: (address: string) => Observation | undefined
  readonly set: (address: string, observation: Observation) => void
}

export interface MemoryStore extends ObservationStore {
  readonly snapshot: () => Observations
  readonly load: (snapshot: Schema.Json) => Effect.Effect<void, ObservationSnapshotRefused>
  readonly size: () => number
  readonly clear: () => void
}

const declaredVersionOf = (snapshot: Schema.Json): number | undefined =>
  Option.getOrUndefined(
    Option.map(Schema.decodeUnknownOption(SnapshotVersion)(snapshot), (declared) => declared.version),
  )

const unsupportedOf = (version: number | undefined, issue: string): UnsupportedObservationFormatError => {
  const claimed = version ?? 0
  return new UnsupportedObservationFormatError({
    version: claimed,
    detail: `Unsupported observation format v${claimed}; addresses are not comparable across versions (${issue})`,
  })
}

const refusalOf = (snapshot: Schema.Json, issue: string): ObservationSnapshotRefused =>
  Match.value(declaredVersionOf(snapshot)).pipe(
    Match.when(2, () => new MalformedObservationSnapshotError({ detail: issue })),
    Match.orElse((version) => unsupportedOf(version, issue)),
  )

const decodeSnapshot = (snapshot: Schema.Json): Effect.Effect<Observations, ObservationSnapshotRefused> =>
  Result.match(Schema.decodeUnknownResult(Observations)(snapshot), {
    onSuccess: Effect.succeed,
    onFailure: (issue) => Effect.fail(refusalOf(snapshot, issue.message)),
  })

const entriesOf = (initial: Observations | undefined): ReadonlyArray<readonly [string, Observation]> =>
  initial === undefined ? [] : Object.entries(initial.entries)

/**
 * An in-memory store that can also be snapshotted and reloaded.
 *
 * Use `set` to merge one observation; `load` replaces the contents, so a
 * snapshot round-trips exactly.
 */
export const store = (initial?: Observations): MemoryStore => {
  const values = MutableRef.make(new Map<string, Observation>(entriesOf(initial)))
  return {
    [TypeId]: TypeId,
    get: (address) => values.current.get(address),
    set: (address, observation) => {
      values.current.set(address, observation)
    },
    snapshot: () => new Observations({ version: 2, entries: Object.fromEntries(values.current) }),
    load: (snapshot) =>
      Effect.flatMap(decodeSnapshot(snapshot), (decoded) =>
        Effect.sync(() => {
          values.current.clear()
          for (const [address, observation] of Object.entries(decoded.entries)) {
            values.current.set(address, observation)
          }
        })),
    size: () => values.current.size,
    clear: () => {
      values.current.clear()
    },
    ...Prototype,
  }
}
