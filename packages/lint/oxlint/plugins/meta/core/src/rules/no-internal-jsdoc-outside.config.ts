export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const OUTSIDE_TAG_EXPECTED = 'no @internal tag outside an internal folder'
export const OUTSIDE_TAG_ACTUAL = 'an @internal tag on a file that is not under an internal directory'
export const OUTSIDE_TAG_FIX =
  'delete the tag, or move the declaration into an internal folder. Never tag a public re-export'

export const meta = {
  type: 'problem',
  docs: {
    description: 'Forbid a JSDoc @internal tag on any file whose path has no directory segment named internal',
  },
  schema: [],
  messages: {
    internalTagOutsideFolder: MESSAGE,
  },
} as const
