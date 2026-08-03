import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ACL_SUFFIX = '.acl.ts' as const

export const TRANSFORM_OR_FAIL_REQUIRED_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A .acl.ts file must contain at least one S.transformOrFail call. The ACL cell is a unidirectional Schema.transformOrFail decoding a foreign shape into a branded domain type — a file without one is not an ACL.',
  },
  schema: [Options],
  messages: {
    transformOrFailRequired: TRANSFORM_OR_FAIL_REQUIRED_MESSAGE,
  },
} as const
