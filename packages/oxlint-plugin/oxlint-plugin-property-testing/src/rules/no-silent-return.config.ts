export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Property predicates (it.prop / it.effect.prop from @effect/vitest) must return a boolean verdict on every code path. fast-check counts undefined as success, so a bare return, a non-boolean return, or falling off the end of the body is a silent pass. Opaque values (identifiers, member expressions, calls) are trusted to be boolean; literals and operators are checked.',
  },
  schema: [],
  messages: {
    bareReturn: MESSAGE,
    nonBooleanReturn: MESSAGE,
    missingReturn: MESSAGE,
    nonBooleanBody: MESSAGE,
  },
} as const
