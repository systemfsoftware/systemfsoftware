import { Handle } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Result, Schema } from 'effect'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as MutableRef from 'effect/MutableRef'
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

const ObservationStore = Handle.make<{
  readonly observations: MutableRef.MutableRef<ReadonlyMap<string, Observation>>
}>()(TypeId)

export type ObservationStore = Handle.Of<typeof ObservationStore>

export const isObservationStore = ObservationStore.is

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

const entriesOf = (initial: Observations | undefined): ReadonlyMap<string, Observation> =>
  new Map(initial === undefined ? [] : Object.entries(initial.entries))

export const store = (initial?: Observations): ObservationStore =>
  ObservationStore.make({ observations: MutableRef.make(entriesOf(initial)) })

export const get: {
  (address: string): (self: ObservationStore) => Effect.Effect<Option.Option<Observation>>
  (self: ObservationStore, address: string): Effect.Effect<Option.Option<Observation>>
} = dual(
  2,
  (self: ObservationStore, address: string): Effect.Effect<Option.Option<Observation>> =>
    Effect.sync(() => Option.fromUndefinedOr(MutableRef.get(self.observations).get(address))),
)

export const set: {
  (address: string, observation: Observation): (self: ObservationStore) => Effect.Effect<void>
  (self: ObservationStore, address: string, observation: Observation): Effect.Effect<void>
} = dual(
  (args) => isObservationStore(args[0]),
  (self: ObservationStore, address: string, observation: Observation): Effect.Effect<void> =>
    Effect.sync(() => {
      MutableRef.update(self.observations, (values) => new Map(values).set(address, observation))
    }),
)

export const snapshot = (self: ObservationStore): Effect.Effect<Observations> =>
  Effect.sync(() => Observations.make({ version: 2, entries: Object.fromEntries(MutableRef.get(self.observations)) }))

export const load: {
  (snapshot: Schema.Json): (self: ObservationStore) => Effect.Effect<void, ObservationSnapshotRefused>
  (self: ObservationStore, snapshot: Schema.Json): Effect.Effect<void, ObservationSnapshotRefused>
} = dual(
  2,
  (self: ObservationStore, snapshot: Schema.Json): Effect.Effect<void, ObservationSnapshotRefused> =>
    Effect.flatMap(decodeSnapshot(snapshot), (decoded) =>
      Effect.sync(() => {
        MutableRef.set(self.observations, new Map(Object.entries(decoded.entries)))
      })),
)

export const size = (self: ObservationStore): Effect.Effect<number> =>
  Effect.sync(() => MutableRef.get(self.observations).size)

export const clear = (self: ObservationStore): Effect.Effect<void> =>
  Effect.sync(() => {
    MutableRef.set(self.observations, new Map())
  })
