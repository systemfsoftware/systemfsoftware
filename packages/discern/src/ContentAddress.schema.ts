import { Match, Schema } from 'effect'
import type * as Decision from 'effect/ai/Decision'
import { dual } from 'effect/Function'

/**
 * The canonical digest of a value, used to key recordings, caches, and decision
 * definitions by content rather than by the caller's id.
 */
export const ContentAddress = Schema.String.pipe(
  Schema.annotate({
    identifier: 'ContentAddress',
    description: 'A canonical content address derived from a value',
    title: 'Content Address',
  }),
  Schema.brand('@systemfsoftware/discern/ContentAddress'),
)
export type ContentAddress = typeof ContentAddress.Type

/** JSON-like data whose canonical form is the input to its content address. */
export type Hashable =
  | null
  | undefined
  | boolean
  | number
  | string
  | ReadonlyArray<Hashable>
  | { readonly [key: string]: Hashable }

type Scalarish = null | undefined | boolean | number | string
type Composite = ReadonlyArray<Hashable> | { readonly [key: string]: Hashable }

const scalarOf = (value: Hashable): string => (value === undefined ? 'undefined' : JSON.stringify(value))

const isScalarish = (value: Hashable): value is Scalarish => value === null || typeof value !== 'object'

const isList = (value: Composite): value is ReadonlyArray<Hashable> => Array.isArray(value)

const membersOf = (record: { readonly [key: string]: Hashable }, sortKeys: boolean): string =>
  (sortKeys ? Object.keys(record).sort() : Object.keys(record))
    .map((key) => `${JSON.stringify(key)}:${canonicalOf(record[key], sortKeys)}`)
    .join(',')

const compositeOf = (value: Composite, sortKeys: boolean): string =>
  isList(value)
    ? `[${value.map((item) => canonicalOf(item, sortKeys)).join(',')}]`
    : `{${membersOf(value, sortKeys)}}`

const canonicalOf = (value: Hashable, sortKeys: boolean): string =>
  isScalarish(value) ? scalarOf(value) : compositeOf(value, sortKeys)

const digestOf = (input: string): string => {
  const [a, b] = input.split('').reduce<readonly [number, number]>(
    ([first, second], unit) => [
      Math.imul(first ^ unit.charCodeAt(0), 0x01000193),
      Math.imul(second ^ unit.charCodeAt(0), 0x85ebca6b),
    ],
    [0x811c9dc5, 0x9e3779b9],
  )
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36).padStart(7, '0')}`
}

/**
 * A canonical string for any JSON-like value, treating objects as unordered, so
 * `{b, a}` and `{a, b}` hash alike. Array order is always preserved, because it
 * is meaningful.
 */
export const hash = (value: Hashable): ContentAddress =>
  ContentAddress.make(digestOf(typeof value === 'string' ? value : canonicalOf(value, true)))

const decisionHashable = (decision: Decision.Any): Hashable =>
  Match.value(decision).pipe(
    Match.tag(
      'Classify',
      (classified): Hashable => ({
        _tag: 'Classify',
        instructions: classified.instructions,
        criteria: { ...classified.criteria },
      }),
    ),
    Match.tag(
      'Rate',
      (rated): Hashable => ({ _tag: 'Rate', instructions: rated.instructions, criteria: [...rated.criteria] }),
    ),
    Match.tag(
      'Probability',
      (probable): Hashable => ({
        _tag: 'Probability',
        instructions: probable.instructions,
        criteria: { ...probable.criteria },
      }),
    ),
    Match.exhaustive,
  )

/** Identity of a decision *definition* — instructions and criteria, not its id. */
export const decisionFingerprint = (decision: Decision.Any): ContentAddress =>
  ContentAddress.make(`df_${digestOf(canonicalOf(decisionHashable(decision), false))}`)

/**
 * Content address of one semantic observation: the decision definition together
 * with the encoded input it was asked about, so a single store can hold
 * observations from many matchers, and from the same decision asked about
 * different inputs, without collisions.
 */
export const observationAddress: {
  (state: Schema.Json): (decision: Decision.Any) => ContentAddress
  (decision: Decision.Any, state: Schema.Json): ContentAddress
} = dual(
  2,
  (decision: Decision.Any, state: Schema.Json): ContentAddress =>
    ContentAddress.make(
      `o_${digestOf(`${canonicalOf(decisionHashable(decision), false)}|${canonicalOf(state, true)}`)}`,
    ),
)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')
  const { classify, probability, rate } = await import('effect/ai/Decision')

  const levelsOf = (extra: ReadonlyArray<string>): ReadonlyArray<string> => [
    ...new Set(['__a', '__b', ...extra]),
  ]

  it.prop(
    '∀v_AddressTotality_∈Strings',
    { of: [Schema.Union([Schema.Undefined, Schema.Json])], subject: hash },
    (subject, [value]) => typeof subject(value) === 'string',
  )

  it.prop(
    '∀ab_ArrayOrder_≠Reversed',
    { of: [Schema.String, Schema.String], subject: hash },
    (subject, [a, b]) => a === b || subject([a, b]) !== subject([b, a]),
  )

  it.prop(
    '∀ab_ArrayElementBoundary_≠Concatenated',
    {
      of: [
        Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 9 }))),
        Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 9 }))),
      ],
      subject: hash,
    },
    (subject, [a, b]) => subject([a, b]) !== subject([a * 10 + b]),
  )

  it.prop(
    '∀k_ObjectKeyOrder_≡Sorted',
    { of: [Schema.String, Schema.Int, Schema.Int], subject: hash },
    (subject, [key, a, b]) => {
      const written = { [key]: a, [`${key}!`]: b }
      const reordered = { [`${key}!`]: b, [key]: a }
      return subject(written) === subject(reordered) && subject(written) !== subject({ [`${key}!`]: b })
    },
  )

  it.prop(
    '∀ab_RateFingerprint_≠Criteria',
    { of: [Schema.Array(Schema.String), Schema.Array(Schema.String)], subject: decisionFingerprint },
    (subject, [a, b]) => {
      const left = levelsOf(a)
      const right = levelsOf(b)
      return JSON.stringify(left) === JSON.stringify(right) ||
        subject(rate({ instructions: 'i', criteria: left })) !== subject(rate({ instructions: 'i', criteria: right }))
    },
  )

  const criteriaOf = (value: { readonly false: string; readonly true: string }) => ({
    false: value.false,
    true: value.true,
  })

  it.prop(
    '∀ab_ProbabilityFingerprint_≠Criteria',
    {
      of: [
        Schema.Struct({ false: Schema.String, true: Schema.String }),
        Schema.Struct({ false: Schema.String, true: Schema.String }),
      ],
      subject: decisionFingerprint,
    },
    (subject, [a, b]) => {
      const left = criteriaOf(a)
      const right = criteriaOf(b)
      return JSON.stringify(left) === JSON.stringify(right) ||
        subject(probability({ instructions: 'i', criteria: left })) !==
          subject(probability({ instructions: 'i', criteria: right }))
    },
  )

  it.prop(
    '∀i_ClassifyFingerprint_≡TaggedCanonical',
    { of: [Schema.String, Schema.String, Schema.String], subject: decisionFingerprint },
    (subject, [instructions, falseLabel, trueLabel]) => {
      const decision = classify({ instructions, criteria: { false: falseLabel, true: trueLabel } })
      const canonical = `{"_tag":"Classify","instructions":${JSON.stringify(instructions)},"criteria":{"false":${
        JSON.stringify(falseLabel)
      },"true":${JSON.stringify(trueLabel)}}}`
      return subject(decision) === `df_${hash(canonical)}`
    },
  )
}
