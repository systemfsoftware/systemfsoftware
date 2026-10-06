import type { AnyStateMachine, EventFrom, SnapshotFrom } from '@systemfsoftware/xstate'
import * as Arbitrary from 'effect/Arbitrary'
import * as Effect from 'effect/Effect'
import type * as Schema from 'effect/Schema'
import * as fc from 'fast-check'
import type { FastCheckGeneratorKind } from './adapter.js'
import type { TestEventGenerators } from './engine/index.js'
import {
  eventsFromSchemas as baseEventsFromSchemas,
  type EventsFromSchemasOptions,
  type SchemaConverter,
} from './schema.js'

const effectConverter: SchemaConverter = (schema) =>
  schema !== null &&
    (typeof schema === 'object' || typeof schema === 'function') &&
    typeof (schema as { ast?: { _tag?: unknown } }).ast === 'object'
    ? (fromEffectSchema(schema as Schema.Top) as fc.Arbitrary<unknown>)
    : undefined

/**
 * Converts an Effect Schema into a native FastCheck arbitrary.
 *
 * @experimental
 */
export function fromEffectSchema<TSchema extends Schema.Top>(
  schema: TSchema,
): fc.Arbitrary<TSchema['Type']> {
  // Effect 4.0.1 removed Schema.toArbitrary: Schema arbitraries run on Effect's own engine, not fast-check.
  // fast-check draws the seed, so a run replays from fast-check's seed; a failing value does not shrink.
  const arbitrary = Arbitrary.schema(schema)
  return fc.integer().map((seed) => Effect.runSync(Arbitrary.sampleEffect(arbitrary, { count: 1, seed }))[0]!)
}

/**
 * Converts a keyed payload-schema map for use by `propertyTest()`.
 *
 * @experimental
 */
export function fromEffectSchemas<
  TSchemas extends Readonly<Record<string, Schema.Top>>,
>(
  schemas: TSchemas,
): {
  [TKey in keyof TSchemas]: fc.Arbitrary<TSchemas[TKey]['Type']>
} {
  return Object.fromEntries(
    Object.entries(schemas).map(([key, schema]) => [
      key,
      fromEffectSchema(schema),
    ]),
  ) as {
    [TKey in keyof TSchemas]: fc.Arbitrary<TSchemas[TKey]['Type']>
  }
}

/**
 * Same as `eventsFromSchemas` from `@xstate/test`, with Effect Schema
 * support registered.
 *
 * @experimental
 */
export function eventsFromSchemas<TMachine extends AnyStateMachine>(
  machine: TMachine,
  options: EventsFromSchemasOptions = {},
): TestEventGenerators<
  SnapshotFrom<TMachine>,
  EventFrom<TMachine>,
  FastCheckGeneratorKind
> {
  return baseEventsFromSchemas(machine, {
    ...options,
    converters: [effectConverter, ...(options.converters ?? [])],
  })
}
