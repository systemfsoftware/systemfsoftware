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
