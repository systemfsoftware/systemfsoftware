import { JSONSchema, Schema as S } from 'effect'

export const Options = S.Struct({})

export const BARE_UNION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A union of S.TaggedClass/S.TaggedError variants must be declared as a schema — const X = S.Union(A, B) paired with type X = S.Schema.Type<typeof X> — never as a bare TS type alias. The bare form is type-only: it cannot decode or encode, cannot nest inside another schema, and produces no arbitrary for property tests.',
  },
  schema: [JSONSchema.make(Options)],
  messages: {
    bareUnionAlias: BARE_UNION_MESSAGE,
  },
} as const
