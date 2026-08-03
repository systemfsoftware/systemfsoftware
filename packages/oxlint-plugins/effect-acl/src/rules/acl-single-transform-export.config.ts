import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ACL_SUFFIX = '.acl.ts' as const

export const SINGLE_TRANSFORM_EXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const DISALLOWED_EXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      '*.acl.ts must export exactly one transform — the ACL itself. Each ACL is one unidirectional crossing; a file exporting two or more is two boundaries sharing a name. Types, interfaces, and the source/target schema declarations the transform composes are public and may be exported.',
  },
  schema: [Options],
  messages: {
    tooManyTransformExports: SINGLE_TRANSFORM_EXPORT_MESSAGE,
    disallowedExport: DISALLOWED_EXPORT_MESSAGE,
  },
} as const
