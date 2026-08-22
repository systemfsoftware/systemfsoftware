export const TAG_NAME = '_tag' as const

export const ACTUAL_TXT = 'a _tag property signature in a type position' as const

export const EXPECTED_TAGGED_ERROR = 'S.TaggedError from effect (Schema as S from "effect")' as const

export const EXPECTED_TAGGED_STRUCT =
  'S.TaggedStruct, deriving the type with S.Schema.Type, from effect (Schema as S from "effect")' as const

export const FIX =
  "Ask first whether the union earns its existence: if no consumer distinguishes the variants, delete all but one; if every construction site already knows its variant, call those operations by name and delete the union with its dispatcher. If it survives and its members are encodable, derive the tag from a schema base (const XBase = S.TaggedStruct('X', { ... }); type X = S.Schema.Type<typeof XBase> & { ... }), placing that base in a *.schema.ts or in the *.workflow.ts that owns it so schema-declaration-location stays satisfied. Only where a member cannot be encoded at all - an Effect, a Stream, a foreign prototype - inherit the tag from a module-scope carrier (const XTag = { _tag: 'X' } as const; type XTag = typeof XTag; interface X extends XTag), which forces no constructor and validates nothing" as const

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
