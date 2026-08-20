export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Property predicates (it.prop / it.effect.prop) must never call expect(...), assert*(...), or raw fc.assert/fc.check. The boolean return IS the verdict — assertions fork the failure channel. assert* remains correct in normal (non-property) tests.',
  },
  schema: [],
  messages: {
    expectCall: MESSAGE,
    assertCall: MESSAGE,
    rawFcRun: MESSAGE,
  },
} as const
