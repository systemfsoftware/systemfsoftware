export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CHECK_SITE_NAME = 'a filter declared in this file' as const

export const EXPORTED_NAME = 'an exported filter (its check site may live in another module)' as const

export const MISSING_EXPECTED =
  'a filter whose annotation carries arbitraryConstraint (when the predicate maps to the constraint vocabulary: length, range, pattern, integer, unique) or a node toCodecArbitrary (on a Schema.declare receiver)' as const

export const MISSING_ACTUAL =
  'a filter declared in this file with no constructive-generation metadata: it generates by discarding, so generation cost is rejection sampling and the real generator lives outside the schema' as const

export const MISSING_FIX =
  'attach arbitraryConstraint to this filter at its Schema.makeFilter / Schema.makeFilterGroup annotations when the predicate maps to the constraint vocabulary, or move to Schema.declare with toCodecArbitrary' as const

export const EXPORTED_FIX =
  'attach arbitraryConstraint to the filter here, at its declaration — an exported filter is trusted where it is consumed, so its metadata must live at home' as const

export const RESIDUAL_NAME = 'a struct-level filter declared in this file' as const

export const RESIDUAL_EXPECTED =
  'a struct-level filter whose annotations declare how it generates: arbitrary: { residual: true } for a dense invariant that rejection sampling satisfies, or arbitraryConstraint with minProperties / maxProperties' as const

export const RESIDUAL_ACTUAL =
  'a filter on a Struct / Record / TaggedStruct / TaggedRecord receiver with no generation declaration: Effect generates it by rejection sampling, which exhausts maxDiscards (100) when the invariant is sparse' as const

export const RESIDUAL_FIX =
  "add arbitrary: { residual: true } to this filter's Schema.makeFilter / Schema.makeFilterGroup annotations when most random draws satisfy it, or move a sparse invariant to Schema.declare with toCodecArbitrary" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'An Effect Schema filter consumed by check or exported from a module carries constructive-generation metadata: arbitraryConstraint (or a node toCodecArbitrary override on a Schema.declare receiver). A struct-level filter declares arbitrary: { residual: true } or a minProperties / maxProperties constraint. A filter without them generates by discarding.',
  },
  schema: [],
  messages: {
    filterDiscards: MESSAGE,
    filterResidualUndeclared: MESSAGE,
  },
} as const
