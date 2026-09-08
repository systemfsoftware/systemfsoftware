export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EFFECT_METHOD_EXPECTED =
  'data that carries no effects: methods on schema classes compute plain values from their fields' as const

export const EFFECT_METHOD_ACTUAL =
  'a method on a schema class that builds an effect: data does not build effects, phases do' as const

export const EFFECT_METHOD_FIX =
  'move the effect into the phase that runs it and leave the schema method returning a plain value, or move the method off the schema class' as const

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Methods on Schema classes return plain data, never effects: an async method or a method whose return type mentions Effect or Promise smuggles a phase into data.',
  },
  schema: [],
  messages: {
    effectReturningMethod: MESSAGE,
  },
} as const
