import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ACL_SUFFIX = '.acl.ts' as const

export const AS_CAST_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban `as` casts in *.acl.ts files. An ACL decodes, never casts — branding and typed failures are earned by real decoding through ParseResult.decode, not asserted.',
  },
  schema: [Options],
  messages: {
    asCast: AS_CAST_MESSAGE,
  },
} as const
