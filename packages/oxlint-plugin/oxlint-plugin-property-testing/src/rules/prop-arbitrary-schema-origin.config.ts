export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const VIOLATION_NAME = 'a hand-built fast-check arbitrary with no schema underneath' as const

export const EXPECTED =
  'every in-source it.prop arbitrary is an Effect Schema passed directly — a schema reference, a schema-attached arbitraryConstraint annotation, or a pipe/map chain rooted in one; an input with no schema grows one first' as const

export const ACTUAL =
  'the arbitrary is assembled from fast-check constructors alone, or derives through Schema.toArbitrary, so the generator can emit shapes the schema never declared and the suite stays green while exercising almost nothing' as const

export const FIX =
  'delete the block, or grow the schema the input needs and pass it directly — it.prop([DomainSchema]) is the sanctioned form, with a toCodecArbitrary node override or an arbitraryConstraint filter hint where generation needs help; Schema.toArbitrary is not sanctioned' as const

export const EFFECT_SOURCE = 'effect' as const

export const STOCK_NAME = 'a stock-schema derivation wearing a domain costume' as const

export const STOCK_EXPECTED =
  'the arbitrary derives from a schema this module (or a sibling) declares for its own contract — a domain schema — never from a stock Schema member or stock composition at the prop site' as const

export const STOCK_ACTUAL =
  'the toArbitrary root is Schema.String, Schema.Int, or another stock member — the filter and map chains on it are the hand-built generator, relocated behind a schema-looking call' as const

export const STOCK_FIX =
  'declare the domain schema that states the shape — its filter carries the format, its arbitraryConstraint hint carries the generation metadata, its toCodecArbitrary carries the node override — and pass ThatSchema directly to it.prop' as const

export const FASTCHECK_PACKAGE = 'fast-check' as const

export const SCHEMA_SOURCE_PATTERN = /schema/i

export const SCHEMA_NAMESPACE_NAMES: Record<string, true> = {
  Schema: true,
  Arbitrary: true,
}

export const FASTCHECK_NAMESPACE_NAMES: Record<string, true> = {
  FastCheck: true,
}

export const COMBINATOR_CALLEES: Record<string, true> = {
  pipe: true,
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Inside an import.meta.vitest in-source block, every it.prop / it.effect.prop arbitrary must be an Effect Schema passed directly — a schema reference, a schema-attached arbitraryConstraint annotation, a toCodecArbitrary node override, or a chain rooted in one. Schema.toArbitrary is not sanctioned. A hand-built fast-check construction with no schema underneath reports; statically opaque arbitraries (unresolved or foreign bindings) fail open into the runtime domain audit.',
  },
  schema: [],
  messages: {
    handBuiltArbitrary: MESSAGE,
    stockDerivedArbitrary: MESSAGE,
  },
} as const
