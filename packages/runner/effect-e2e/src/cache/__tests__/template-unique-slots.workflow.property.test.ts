import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { unique } from '../../Config/values.schema.js'
import { expandSlots, sameFlow, slotSpellsOf, TraceEntry } from '../entry.schema.js'
import { StepParams } from '../key.schema.js'
import { type TemplateDecision, TemplateUniqueSlots, templateUniqueSlots } from '../template-unique-slots.workflow.js'

type Template = typeof templateUniqueSlots

type ValuePair = readonly [string, string]

const decisionOf = (template: Template, command: TemplateUniqueSlots): TemplateDecision =>
  Result.match(template(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const boxedOf = (index: number, text: string): string => `⟦${index} ${JSON.stringify(text)}⟧`

const slotValuesOf = (texts: ReadonlyArray<string>): ReadonlyArray<string> =>
  texts.map((text, index) => boxedOf(index, text))

const paramsOf = (values: ReadonlyArray<string>): StepParams =>
  Object.fromEntries(values.map((value, index) => [`p${index}`, unique(value)] as const))

const spelledAlertOf = (value: string, index: number): string =>
  slotSpellsOf({ index, value }).map((spell) => spell.spelled).join(' | ')

const withAlerts = (drawn: TraceEntry, alerts: ReadonlyArray<string>): TraceEntry => ({
  schema: drawn.schema,
  keyedBy: drawn.keyedBy,
  start: drawn.start,
  actions: drawn.actions,
  end: drawn.end,
  anchors: drawn.anchors,
  checks: drawn.checks,
  alerts: [...drawn.alerts, ...alerts],
  provenance: drawn.provenance,
})

const spelledEntryOf = (drawn: TraceEntry, values: ReadonlyArray<string>): TraceEntry =>
  withAlerts(drawn, values.map(spelledAlertOf))

const templatedEntryOf = (template: Template, command: TemplateUniqueSlots): Option.Option<TraceEntry> =>
  Match.value(decisionOf(template, command)).pipe(
    Match.tag('Templated', (decision) => Option.some(decision.entry)),
    Match.tag('NotRecorded', () => Option.none()),
    Match.exhaustive,
  )

const isNotRecorded = (decision: TemplateDecision, reason: 'param-collision' | 'placeholder-literal'): boolean =>
  Match.value(decision).pipe(
    Match.tag('NotRecorded', (recorded) => recorded.reason === reason),
    Match.tag('Templated', () => false),
    Match.exhaustive,
  )

const freshNameOf = (params: StepParams, role: string): string => `${role}:${Object.keys(params).join('|')}`

it.prop(
  '∀e_UniqueSlots_≡ExpandRestoresValues',
  {
    of: [TraceEntry, Schema.Array(Schema.Tuple([Schema.String, Schema.String]))],
    subject: templateUniqueSlots,
    arbitrary: { seed: 498_011 },
  },
  (subject, [drawn, pairs]) => {
    const recorded = slotValuesOf(Arr.map(pairs, ([before]: ValuePair) => before))
    const current = slotValuesOf(Arr.map(pairs, ([, after]: ValuePair) => after))
    const command = new TemplateUniqueSlots({ params: paramsOf(recorded), entry: spelledEntryOf(drawn, recorded) })
    return Option.exists(
      Option.flatMap(templatedEntryOf(subject, command), (templated) => expandSlots(templated, current)),
      (expanded) => sameFlow(expanded, spelledEntryOf(drawn, current)),
    )
  },
)

it.prop(
  '∀p_UniqueSlots_→ParamCollided',
  { of: [StepParams, TraceEntry, Schema.String], subject: templateUniqueSlots, arbitrary: { seed: 498_012 } },
  (subject, [drawn, entry, text]) => {
    const host = freshNameOf(drawn, 'host')
    const params = { ...drawn, [host]: `«${text}»`, [freshNameOf(drawn, 'unique')]: unique(text) }
    return isNotRecorded(decisionOf(subject, new TemplateUniqueSlots({ params, entry })), 'param-collision')
  },
)

it.prop(
  '∀e_UniqueSlots_≡PlaceholderLiteralRefused',
  { of: [TraceEntry, Schema.String], subject: templateUniqueSlots, arbitrary: { seed: 498_013 } },
  (subject, [drawn, text]) => {
    const value = boxedOf(0, text)
    const entry = withAlerts(drawn, [`${JSON.stringify(text)}{$unique:0}`])
    return isNotRecorded(
      decisionOf(subject, new TemplateUniqueSlots({ params: paramsOf([value]), entry })),
      'placeholder-literal',
    )
  },
)
