export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED = 'a dual-shaped export callable data-first and data-last via Function.dual' as const

export const ACTUAL =
  'a hand-curried export returning another arrow function, which locks out the direct data-first caller' as const

export const FIX = 'use Function.dual to expose both the data-first and data-last call shapes' as const

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Ban hand-curried exported const arrows (x) => (y) => .... A hand-curried export locks out the direct data-first caller; use Function.dual. Generic curried factories (<Self>() => ...) are the idiomatic service-tag pattern and are allowed.',
  },
  schema: [],
  messages: {
    handCurriedExport: MESSAGE,
  },
} as const
