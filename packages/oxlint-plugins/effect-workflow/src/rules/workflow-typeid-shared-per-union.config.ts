import { JSONSchema, Schema as S } from 'effect'

export const Options = S.Struct({})

export const UNION_TYPEID_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Every S.TaggedClass/S.TaggedError variant of one union must carry the union\u2019s single shared TypeId symbol (declared with Symbol.for). Different TypeIds across the variants break Match.exhaustive narrowing and the union\u2019s identity invariant.',
  },
  schema: [JSONSchema.make(Options)],
  messages: {
    unionTypeIdMismatch: UNION_TYPEID_MESSAGE,
  },
} as const
