export const TAG_ERROR_MEMBER = 'TaggedError' as const

export const MESSAGE_MEMBER = 'message' as const

export const NAME_SUFFIX = 'extends Schema.TaggedError without a message' as const

export const ANONYMOUS_NAME = '<anonymous>' as const

export const EXPECTED =
  'a non-empty message: an `override get message(): string` getter on the class, or a `message` field in the schema fields' as const

export const ACTUAL = 'a class extending Schema.TaggedError that declares no message' as const

export const FIX =
  'add `override get message(): string` deriving the text from the error fields, or declare `message: Schema.String` in the schema fields and set it where the error is constructed' as const

export const MESSAGE_MISSING =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXEMPT_TREE_SEGMENT = /(?:^|[\\/])(?:tests|__tests__|__fixtures__)[\\/]/u

export const isExemptFile = (filename: string): boolean =>
  filename.endsWith('.test.ts') || EXEMPT_TREE_SEGMENT.test(filename)

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A class extending Schema.TaggedError must declare a message: a `message` getter on the class or a `message` field in its schema fields.',
  },
  schema: [],
  messages: {
    missingMessage: MESSAGE_MISSING,
  },
} as const
