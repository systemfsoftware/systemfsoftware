export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CHECK_SITE_NAME = 'a filter declared in this file' as const

export const EXPORTED_NAME = 'an exported filter (its check site may live in another module)' as const

export const MISSING_EXPECTED =
  'a filter whose annotation carries arbitrary.constraint (when the predicate maps to the constraint vocabulary: length, range, pattern, integer, unique) or arbitrary.candidate (a weighted constructor)' as const

export const MISSING_ACTUAL =
  'a filter declared in this file with no constructive-generation metadata: it generates by discarding, so generation cost is rejection sampling and the real generator lives outside the schema' as const

export const MISSING_FIX =
  'attach arbitrary.constraint or arbitrary.candidate to this filter at its Schema.makeFilter / Schema.makeFilterGroup annotations, or annotate the base schema node with toArbitrary before this check' as const

export const EXPORTED_FIX =
  'attach arbitrary.constraint or arbitrary.candidate to the filter here, at its declaration — an exported filter is trusted where it is consumed, so its metadata must live at home' as const

export const LEGACY_EXPECTED =
  'an arbitrary annotation of { constraint } or { candidate } — v4 composes hints and keeps the predicate as the final check' as const

export const LEGACY_ACTUAL =
  'a function-valued arbitrary annotation on a filter: the v3 form that replaced the node generator instead of composing with it' as const

export const LEGACY_FIX =
  'replace the function with arbitrary: { constraint: {...} } when the predicate maps to the constraint vocabulary, or arbitrary: { candidate: { make: (fc) => ... } } when it needs a constructor' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'An Effect Schema filter consumed by check or exported from a module carries constructive-generation metadata: arbitrary.constraint or arbitrary.candidate (or a node toArbitrary override before the check). A filter without them generates by discarding.',
  },
  schema: [],
  messages: {
    filterDiscards: MESSAGE,
    legacyArbitraryFunction: MESSAGE,
  },
} as const
