import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { ProjectId } from '../Config/config.schema.js'
import { ConfigName, SecretRef } from '../Config/names.schema.js'
import { Unique } from '../Config/values.schema.js'
import { TestId } from '../report/report.schema.js'

const TargetName = ConfigName.pipe(Schema.brand('TargetName'))

export const KeyDigest = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/u, { message: 'a key digest is 64 lowercase hex characters' }),
).pipe(Schema.brand('KeyDigest'))
export type KeyDigest = typeof KeyDigest.Type

export const EngineIdentity = Schema.Struct({ adapter: Schema.String, kind: Schema.String })
export type EngineIdentity = typeof EngineIdentity.Type

export const AgentIdentity = Schema.Struct({ name: ConfigName, contextDigest: KeyDigest })
export type AgentIdentity = typeof AgentIdentity.Type

export const ParamValue = Schema.Union([Unique, SecretRef, Schema.Json])
export type ParamValue = typeof ParamValue.Type

export const StepParams = Schema.Record(Schema.String, ParamValue)
export type StepParams = typeof StepParams.Type

export const UniqueSlot = Schema.Struct({ name: Schema.String, value: Schema.String })
export type UniqueSlot = typeof UniqueSlot.Type

const isUnique = Schema.is(Unique)

const bySlotName = Order.mapInput(Str.Order, (slot: UniqueSlot) => slot.name)

const slotOf = ([name, value]: readonly [string, ParamValue]): ReadonlyArray<UniqueSlot> =>
  isUnique(value) ? [{ name, value: value.value }] : []

export const uniqueSlotsOf = (params: StepParams): ReadonlyArray<UniqueSlot> =>
  Arr.sort(Object.entries(params).flatMap(slotOf), bySlotName)

export const CacheKeyContext = Schema.Struct({
  project: ProjectId,
  test: TestId,
  target: TargetName,
  engine: EngineIdentity,
  app: Schema.String,
  instruction: Schema.String,
  params: Schema.JsonObject,
  slots: Schema.Array(Schema.String),
  agent: AgentIdentity,
})
export type CacheKeyContext = typeof CacheKeyContext.Type

export const CanonicalJson = Schema.String.pipe(Schema.brand('CanonicalJson'))
export type CanonicalJson = typeof CanonicalJson.Type

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)

const isJsonObject = (value: Exclude<Schema.Json, Schema.JsonArray>): value is Schema.JsonObject =>
  Predicate.isObject(value)

const byKey = Order.mapInput(Str.Order, ([key]: readonly [string, Schema.Json]) => key)

const canonicalTextOf = (value: Schema.Json): string =>
  isJsonArray(value) ? `[${value.map(canonicalTextOf).join(',')}]` : canonicalLeafOf(value)

const canonicalObjectOf = (object: Schema.JsonObject): string =>
  `{${
    Arr.sort(Object.entries(object), byKey)
      .map(([key, value]) => `${JSON.stringify(key)}:${canonicalTextOf(value)}`)
      .join(',')
  }}`

const canonicalLeafOf = (value: Exclude<Schema.Json, Schema.JsonArray>): string =>
  isJsonObject(value) ? canonicalObjectOf(value) : JSON.stringify(value)

export const canonicalJsonOf = (value: Schema.Json): CanonicalJson => CanonicalJson.make(canonicalTextOf(value))

export const canonicalKeyOf = (context: CacheKeyContext): CanonicalJson => canonicalJsonOf(context)
