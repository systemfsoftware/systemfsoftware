import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MISSING_ACL_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const ACL_EXPECTED = "a value import of the aggregate's *.acl.ts" as const

export const ACL_FIX =
  'import the ACL and pipe every read through S.decode(SelectACL) and every write through S.encode(UpsertACL) — never return raw rows and never cast' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.store.ts must import its aggregate ACL: every row↔domain crossing goes through the ACL, never a cast. The store calls the ACL but never inlines it.',
  },
  schema: [Options],
  messages: {
    missingAclImport: MISSING_ACL_MESSAGE,
  },
} as const
