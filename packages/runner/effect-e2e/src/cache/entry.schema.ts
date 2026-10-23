import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'

import { ConfigName } from '../Config/names.schema.js'
import { Action } from '../engine/action.schema.js'
import { Route } from '../engine/route.schema.js'
import { Check, ModelRef } from '../verdict/check.schema.js'
import { CacheKeyContext, CanonicalJson, canonicalJsonOf, EngineIdentity } from './key.schema.js'

const MAX_ACTIONS = 50
const MAX_ANCHORS = 8

export const ControlDescriptor = Schema.Struct({
  role: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  context: Schema.Array(Schema.String),
})
export type ControlDescriptor = typeof ControlDescriptor.Type

export const AnchorStates = Schema.Struct({
  checked: Schema.optionalKey(Schema.Boolean),
  selected: Schema.optionalKey(Schema.Boolean),
  expanded: Schema.optionalKey(Schema.Boolean),
  pressed: Schema.optionalKey(Schema.Boolean),
})
export type AnchorStates = typeof AnchorStates.Type

export const Anchor = Schema.Struct({ control: ControlDescriptor, states: AnchorStates })
export type Anchor = typeof Anchor.Type

const AnchorList = Schema.Array(Anchor).check(
  Schema.isMaxLength(MAX_ANCHORS, { message: 'a recording holds at most 8 anchors of each kind' }),
)

export const Anchors = Schema.Struct({ appeared: AnchorList, gone: AnchorList })
export type Anchors = typeof Anchors.Type

export const RecordedAction = Schema.Struct({ action: Action, controls: Schema.Array(ControlDescriptor) })
export type RecordedAction = typeof RecordedAction.Type

export const Provenance = Schema.Struct({
  engine: EngineIdentity,
  engineVersion: Schema.String,
  model: ModelRef,
  agent: ConfigName,
  version: Schema.String,
})
export type Provenance = typeof Provenance.Type

export const TraceFlow = Schema.Struct({
  start: Route,
  actions: Schema.Array(RecordedAction).check(
    Schema.isMaxLength(MAX_ACTIONS, { message: 'a recording holds at most 50 actions' }),
  ),
  end: Route,
  anchors: Anchors,
  checks: Schema.Array(Check),
  alerts: Schema.Array(Schema.String),
})
export type TraceFlow = typeof TraceFlow.Type

export const TraceEntry = Schema.Struct({
  schema: Schema.Literal('trace-1'),
  keyedBy: CacheKeyContext,
  ...TraceFlow.fields,
  provenance: Provenance,
})
export type TraceEntry = typeof TraceEntry.Type

const TraceEntryJson = Schema.toCodecJson(TraceEntry)

const TraceFlowJson = Schema.toCodecJson(TraceFlow)

const FLOW_FIELDS: Record<string, true> = {
  start: true,
  actions: true,
  end: true,
  anchors: true,
  checks: true,
  alerts: true,
}

type TextMap = (text: string) => Option.Option<string>

type JsonField = readonly [string, Schema.Json]

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !isJsonArray(value)

const mapJsonTextOf = (text: TextMap) => (value: Schema.Json): Option.Option<Schema.Json> =>
  isJsonArray(value) ? Option.all(value.map(mapJsonTextOf(text))) : mapLeafTextOf(text, value)

const mapFieldTextOf = (text: TextMap) => ([key, value]: JsonField): Option.Option<JsonField> =>
  key === '_tag' ? Option.some([key, value]) : Option.map(mapJsonTextOf(text)(value), (mapped) => [key, mapped])

const mapObjectTextOf = (text: TextMap, object: Schema.JsonObject): Option.Option<Schema.Json> =>
  Option.map(Option.all(Object.entries(object).map(mapFieldTextOf(text))), Object.fromEntries)

const mapScalarTextOf = (
  text: TextMap,
  value: Exclude<Schema.Json, Schema.JsonArray | Schema.JsonObject>,
): Option.Option<Schema.Json> => (typeof value === 'string' ? text(value) : Option.some(value))

const mapLeafTextOf = (text: TextMap, value: Exclude<Schema.Json, Schema.JsonArray>): Option.Option<Schema.Json> =>
  isJsonObject(value) ? mapObjectTextOf(text, value) : mapScalarTextOf(text, value)

const mapFlowFieldOf = (text: TextMap) => ([key, value]: JsonField): Option.Option<JsonField> =>
  FLOW_FIELDS[key] === true ? mapFieldTextOf(text)([key, value]) : Option.some([key, value])

const encodedFieldsOf = (entry: TraceEntry): Option.Option<ReadonlyArray<JsonField>> =>
  Option.flatMap(
    Schema.encodeOption(TraceEntryJson)(entry),
    (encoded) => isJsonObject(encoded) ? Option.some(Object.entries(encoded)) : Option.none(),
  )

const mapFlowTextOf = (entry: TraceEntry, text: TextMap): Option.Option<TraceEntry> =>
  encodedFieldsOf(entry).pipe(
    Option.flatMap((fields) => Option.all(fields.map(mapFlowFieldOf(text)))),
    Option.flatMap((fields) => Schema.decodeOption(TraceEntryJson)(Object.fromEntries(fields))),
  )

export const mapFlowText: {
  (text: TextMap): (entry: TraceEntry) => Option.Option<TraceEntry>
  (entry: TraceEntry, text: TextMap): Option.Option<TraceEntry>
} = Function.dual(2, mapFlowTextOf)

export const SlotSpelling = Schema.Literals(['raw', 'uri', 'form'])
export type SlotSpelling = typeof SlotSpelling.Type

const SLOT_PLACEHOLDERS = /\{\$unique:(\d+)(?::(uri|form))?\}/gu

const SLOT_PLACEHOLDER = /\{\$unique:\d+(?::(?:uri|form))?\}/u

const percentEncoded = Option.liftThrowable(encodeURIComponent)

const spellers: Record<SlotSpelling, (value: string) => Option.Option<string>> = {
  raw: Option.some,
  uri: percentEncoded,
  form: (value) => Option.map(percentEncoded(value), (encoded) => encoded.replaceAll('%20', '+')),
}

const spellSlot = (value: string, spelling: SlotSpelling): Option.Option<string> => spellers[spelling](value)

const slotPlaceholderOf = (index: number, spelling: SlotSpelling): string =>
  spelling === 'raw' ? `{$unique:${index}}` : `{$unique:${index}:${spelling}}`

export const IndexedSlot = Schema.Struct({ index: Schema.Int, value: Schema.String })
export type IndexedSlot = typeof IndexedSlot.Type

export const SlotSpell = Schema.Struct({ spelled: Schema.String, placeholder: Schema.String })
export type SlotSpell = typeof SlotSpell.Type

const SPELLINGS: ReadonlyArray<SlotSpelling> = ['raw', 'uri', 'form']

const slotSpellOf = (slot: IndexedSlot) => (spelling: SlotSpelling): Option.Option<SlotSpell> =>
  Option.map(spellSlot(slot.value, spelling), (spelled) => ({
    spelled,
    placeholder: slotPlaceholderOf(slot.index, spelling),
  }))

export const slotSpellsOf = (slot: IndexedSlot): ReadonlyArray<SlotSpell> =>
  Arr.dedupeWith(
    Arr.getSomes(SPELLINGS.map(slotSpellOf(slot))),
    (left, right) => left.spelled === right.spelled,
  )

const spellingOf = (marker: string | undefined): SlotSpelling => Schema.is(SlotSpelling)(marker) ? marker : 'raw'

const fillOf = (values: ReadonlyArray<string>) => (match: RegExpExecArray): Option.Option<readonly [string, string]> =>
  Arr.get(values, Number(match[1])).pipe(
    Option.flatMap((value) => spellSlot(value, spellingOf(match[2]))),
    Option.map((filled) => [match[0], filled] as const),
  )

const filledTextOf = (text: string, fills: ReadonlyArray<readonly [string, string]>): string => {
  const byPlaceholder: Record<string, string> = Object.fromEntries(fills)
  return text.replace(SLOT_PLACEHOLDERS, (placeholder) => byPlaceholder[placeholder] ?? placeholder)
}

const expandTextOf = (values: ReadonlyArray<string>) => (text: string): Option.Option<string> =>
  Option.map(
    Option.all(Array.from(text.matchAll(SLOT_PLACEHOLDERS), fillOf(values))),
    (fills) => filledTextOf(text, fills),
  )

export const expandSlots: {
  (values: ReadonlyArray<string>): (entry: TraceEntry) => Option.Option<TraceEntry>
  (entry: TraceEntry, values: ReadonlyArray<string>): Option.Option<TraceEntry>
} = Function.dual(
  2,
  (entry: TraceEntry, values: ReadonlyArray<string>): Option.Option<TraceEntry> =>
    mapFlowText(entry, expandTextOf(values)),
)

const placeholderFree = (text: string): Option.Option<string> =>
  SLOT_PLACEHOLDER.test(text) ? Option.none() : Option.some(text)

export const flowSpellsPlaceholder = (entry: TraceEntry): boolean => Option.isNone(mapFlowText(entry, placeholderFree))

export const entryWireTextOf = (entry: TraceEntry): Option.Option<CanonicalJson> =>
  Option.map(Schema.encodeOption(TraceEntryJson)(entry), canonicalJsonOf)

export const entryWireBytesOf = (entry: TraceEntry): number =>
  Option.match(entryWireTextOf(entry), {
    onNone: () => Number.POSITIVE_INFINITY,
    onSome: (text) => new TextEncoder().encode(text).byteLength,
  })

const flowTextOf = (flow: TraceFlow): Option.Option<CanonicalJson> =>
  Option.map(Schema.encodeOption(TraceFlowJson)(flow), canonicalJsonOf)

export const sameFlow: {
  (right: TraceEntry): (left: TraceEntry) => boolean
  (left: TraceEntry, right: TraceEntry): boolean
} = Function.dual(
  2,
  (left: TraceEntry, right: TraceEntry): boolean =>
    Option.match(Option.all([flowTextOf(left), flowTextOf(right)]), {
      onNone: () => false,
      onSome: ([leftText, rightText]) => leftText === rightText,
    }),
)
