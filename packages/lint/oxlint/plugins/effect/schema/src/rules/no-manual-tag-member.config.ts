export const TAG_NAME = '_tag' as const

export const ACTUAL_TXT = 'a _tag property signature in a type position' as const

export const EXPECTED_TAGGED_ERROR = 'S.TaggedError from effect (Schema as S from "effect")' as const

export const EXPECTED_TAGGED_STRUCT =
  'S.TaggedStruct, deriving the type with S.Schema.Type, from effect (Schema as S from "effect")' as const

export const FIX =
  'Inherit the member from a tag carrier (interface X extends XTag) or derive it (type X = S.Schema.Type<typeof XBase> & { ... }); keep hand-written only the members no schema can express, or delete the type when it defends nothing' as const

export const NAME_SUFFIX = 'with a hand-written _tag member' as const

export const ANONYMOUS_NAME = 'an anonymous type literal' as const

export const MESSAGE_FORBIDDEN = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.'

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban hand-written _tag property signatures in type positions. Use S.TaggedStruct or S.TaggedError and derive the type with S.Schema.Type instead.',
  },
  schema: [],
  messages: {
    forbidden: MESSAGE_FORBIDDEN,
  },
} as const
