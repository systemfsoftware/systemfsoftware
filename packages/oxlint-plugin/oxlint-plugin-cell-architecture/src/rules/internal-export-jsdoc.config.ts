export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const MISSING_TAG_EXPECTED = 'JSDoc @internal on every export in an internal folder'
export const MISSING_TAG_ACTUAL = 'an export with no @internal tag'
export const MISSING_TAG_FIX =
  'add /** @internal */ on this declaration. Do not put the tag on a public barrel re-export'

export const OUTSIDE_TAG_EXPECTED = 'no @internal tag outside an internal folder'
export const OUTSIDE_TAG_ACTUAL = 'an @internal tag on a file that is not under an internal directory'
export const OUTSIDE_TAG_FIX =
  'delete the tag, or move the declaration into an internal folder. Never tag a public re-export'

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Require a JSDoc @internal tag on an export if and only if its file sits under a directory segment named internal',
  },
  schema: [],
  messages: {
    missingInternalTag: MESSAGE,
    internalTagOutsideFolder: MESSAGE,
  },
} as const
