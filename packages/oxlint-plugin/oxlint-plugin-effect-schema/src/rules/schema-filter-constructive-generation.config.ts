export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CHECK_SITE_NAME = 'a filter declared in this file' as const

export const EXPORTED_NAME = 'an exported filter (its check site may live in another module)' as const

export const MISSING_EXPECTED =
  'a filter whose annotation carries arbitraryConstraint (declarative generation hints merged across the node; the predicate remains authoritative)' as const

export const MISSING_ACTUAL =
  'a filter declared in this file with no constructive-generation metadata: it generates by discarding, so generation cost is rejection sampling and the real generator lives outside the schema' as const

export const MISSING_FIX =
  'attach arbitraryConstraint to this filter at its Schema.makeFilter / Schema.makeFilterGroup annotations, or annotate the base schema node with toCodecArbitrary before this check' as const

export const EXPORTED_FIX =
  'attach arbitraryConstraint to the filter here, at its declaration — an exported filter is trusted where it is consumed, so its metadata must live at home' as const

export const LEGACY_EXPECTED =
  'a function-valued arbitrary annotation on a filter: the retired v3 replacement form' as const
export const LEGACY_ACTUAL =
  'a function-valued arbitrary annotation on a filter: the v3 form that replaced the node generator instead of composing with it' as const
export const LEGACY_FIX =
  'replace the function-valued arbitrary with arbitraryConstraint: {...} carrying the declarative hints the predicate needs' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'An Effect Schema filter consumed by check or exported from a module carries constructive-generation metadata: arbitraryConstraint (or a node toCodecArbitrary override before the check). A filter without them generates by discarding.',
  },
  schema: [],
  messages: {
    filterDiscards: MESSAGE,
    legacyArbitraryFunction: MESSAGE,
  },
} as const
