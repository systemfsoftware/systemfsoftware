export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const BARE_EXPECTED =
  'a domain Struct field that carries an honest claim — the stock member stating its shape (S.NonEmptyString, S.Int, S.Finite, S.Literals([...])), a brand naming the role the field plays, or the check refinement the claim needs when no stock member states it' as const

export const BARE_ACTUAL =
  "a Struct field holding a bare primitive with neither a check refinement nor a brand naming its role anywhere in its chain, so decoding accepts every value of the primitive type and the field's name carries no type-level force" as const

export const BARE_FIX =
  "use the stock member that states the shape (S.NonEmptyString, S.Int, S.Finite, S.Literals([...])), or pipe S.brand('Role') naming the role the field plays; when no stock member states the constraint, pipe the check refinement the claim needs; when the field accepts the whole primitive range and states no domain claim, delete the field and pass the primitive itself" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A domain Struct field holding a bare primitive (String, Number, Boolean, unrefined Unknown) carries a check refinement in its chain, a brand naming its role, or uses an already-refined member. An annotation alone is not a claim.',
  },
  schema: [],
  messages: {
    barePrimitiveField: MESSAGE,
  },
} as const
