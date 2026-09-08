export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED = 'an exported function with at most three positional parameters' as const

export const ACTUAL =
  'an exported function with four or more positional parameters: at four positionals the call site is unreadable and every addition breaks' as const

export const FIX = 'take an options object instead of four or more positionals' as const

export const MAX_POSITIONAL_PARAMETERS = 3 as const

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Ban exported functions with four or more positional parameters (rest counts as one; optional params count). At four positionals the call site is unreadable and every addition breaks; take an options object.',
  },
  schema: [],
  messages: {
    longSignature: MESSAGE,
  },
} as const
