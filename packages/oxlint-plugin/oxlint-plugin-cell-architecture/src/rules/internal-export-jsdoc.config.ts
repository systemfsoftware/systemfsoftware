export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const MISSING_TAG_EXPECTED = 'JSDoc @internal on every export in an internal folder'
export const MISSING_TAG_ACTUAL = 'an export with no @internal tag'
export const MISSING_TAG_FIX =
  'add /** @internal */ on this declaration. Do not put the tag on a public barrel re-export'

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Require a JSDoc @internal tag on every export whose file sits under a directory segment named internal',
  },
  schema: [],
  messages: {
    missingInternalTag: MESSAGE,
  },
} as const
