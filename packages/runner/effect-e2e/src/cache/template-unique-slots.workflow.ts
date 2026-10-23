import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { Unique } from '../Config/values.schema.js'
import { flowSpellsPlaceholder, mapFlowText, type SlotSpell, slotSpellsOf, TraceEntry } from './entry.schema.js'
import { canonicalJsonOf, type ParamValue, StepParams, type UniqueSlot, uniqueSlotsOf } from './key.schema.js'

const TemplateUniqueSlotsTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/TemplateUniqueSlots')

export class TemplateUniqueSlots extends Schema.TaggedClass<TemplateUniqueSlots>()('TemplateUniqueSlots', {
  params: StepParams,
  entry: TraceEntry,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class Templated extends Schema.TaggedClass<Templated>()('Templated', {
  entry: TraceEntry,
}) {
  readonly [TemplateUniqueSlotsTypeId] = TemplateUniqueSlotsTypeId
}

export class NotRecorded extends Schema.TaggedClass<NotRecorded>()('NotRecorded', {
  reason: Schema.Literals(['param-collision', 'placeholder-literal']),
}) {
  readonly [TemplateUniqueSlotsTypeId] = TemplateUniqueSlotsTypeId
}

export const TemplateDecision = Schema.Union([Templated, NotRecorded])
export type TemplateDecision = typeof TemplateDecision.Type

const isUnique = Schema.is(Unique)

const spelledFormsOf = (value: string): ReadonlyArray<string> =>
  slotSpellsOf({ index: 0, value }).map((spell) => spell.spelled)

const plainTextsOf = (value: ParamValue): ReadonlyArray<string> =>
  Option.match(Option.liftPredicate(value, Schema.is(Schema.String)), {
    onNone: () => [canonicalJsonOf(value)],
    onSome: (text: string) => [text],
  })

const paramTextsOf = (value: ParamValue): ReadonlyArray<string> =>
  Option.match(Option.liftPredicate(value, isUnique), {
    onNone: () => plainTextsOf(value),
    onSome: (marked: Unique) => spelledFormsOf(marked.value),
  })

const otherTextsOf = (params: StepParams, self: string): ReadonlyArray<string> =>
  Object.entries(params)
    .filter(([name]) => name !== self)
    .map((entry) => paramTextsOf(entry[1]))
    .flat()

const collidesIn = (spelled: string, texts: ReadonlyArray<string>): boolean =>
  Match.value(spelled.length === 0).pipe(
    Match.when(true, () => true),
    Match.when(false, () => Arr.some(texts, (text) => text.includes(spelled))),
    Match.exhaustive,
  )

const slotCollides = (params: StepParams, slot: UniqueSlot, index: number): boolean =>
  Arr.some(
    slotSpellsOf({ index, value: slot.value }),
    (spell) => collidesIn(spell.spelled, otherTextsOf(params, slot.name)),
  )

const paramCollisionOf = (params: StepParams): boolean =>
  Arr.some(uniqueSlotsOf(params), (slot, index) => slotCollides(params, slot, index))

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu

const escapedOf = (text: string): string => text.replace(REGEX_SPECIAL, '\\$&')

const spellsOf = (params: StepParams): ReadonlyArray<SlotSpell> =>
  uniqueSlotsOf(params).flatMap((slot, index) => slotSpellsOf({ index, value: slot.value }))

const longestFirstOf = (spells: ReadonlyArray<SlotSpell>): ReadonlyArray<SlotSpell> =>
  [...spells].sort((left, right) => right.spelled.length - left.spelled.length)

const combinedPatternOf = (spells: ReadonlyArray<SlotSpell>): RegExp =>
  new RegExp(longestFirstOf(spells).map((spell) => escapedOf(spell.spelled)).join('|'), 'gu')

const placeholdersOf = (spells: ReadonlyArray<SlotSpell>): Record<string, string> =>
  Object.fromEntries(Arr.reverse(spells).map((spell) => [spell.spelled, spell.placeholder]))

const placeholderOf = (placeholders: Record<string, string>, matched: string): string =>
  Option.getOrElse(Option.fromNullishOr(placeholders[matched]), () => matched)

const templatedTextOf = (spells: ReadonlyArray<SlotSpell>) => (text: string): Option.Option<string> => {
  const placeholders = placeholdersOf(spells)
  return Option.some(text.replace(combinedPatternOf(spells), (matched) => placeholderOf(placeholders, matched)))
}

const templatedDecisionOf = (command: TemplateUniqueSlots): TemplateDecision =>
  Option.match(mapFlowText(command.entry, templatedTextOf(spellsOf(command.params))), {
    onNone: () => new NotRecorded({ reason: 'param-collision' }),
    onSome: (entry: TraceEntry) => new Templated({ entry }),
  })

const placeholderDecisionOf = (command: TemplateUniqueSlots): TemplateDecision =>
  Match.value(flowSpellsPlaceholder(command.entry)).pipe(
    Match.when(true, () => new NotRecorded({ reason: 'placeholder-literal' })),
    Match.when(false, () => templatedDecisionOf(command)),
    Match.exhaustive,
  )

export const templateUniqueSlots = Workflow.make({
  command: TemplateUniqueSlots,
  decision: TemplateDecision,
  error: Schema.Never,
  decide: (command): Result.Result<TemplateDecision, never> =>
    Result.succeed(
      Match.value(paramCollisionOf(command.params)).pipe(
        Match.when(true, () => new NotRecorded({ reason: 'param-collision' })),
        Match.when(false, () => placeholderDecisionOf(command)),
        Match.exhaustive,
      ),
    ),
})
