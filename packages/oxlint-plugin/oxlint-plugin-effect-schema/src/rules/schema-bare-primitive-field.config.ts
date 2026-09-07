export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const BARE_EXPECTED =
  'a domain Struct field that carries a runtime check — a refinement in its pipe chain (filter, check, minLength, maxLength, pattern) or an already-refined stock member (Int, Finite, NonEmptyString)' as const

export const BARE_ACTUAL =
  'a Struct field holding a bare primitive with no refinement anywhere in its chain, so decoding accepts every value of the primitive type' as const

export const BARE_FIX =
  'grow the check the field needs — pipe S.filter or S.check (or S.minLength, S.maxLength, S.pattern) onto the primitive, or replace it with the refined member that states the shape; when the field accepts the whole primitive range and states no domain claim, delete the field and pass the primitive itself' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A domain Struct field holding a bare primitive (String, Number, Boolean, unrefined Unknown) carries a refinement in its chain or uses an already-refined member. A brand or an annotation alone is not a check.',
  },
  schema: [],
  messages: {
    barePrimitiveField: MESSAGE,
  },
} as const
