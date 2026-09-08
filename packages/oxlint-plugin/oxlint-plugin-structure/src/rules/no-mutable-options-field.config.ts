export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED = 'readonly fields on an Options/Spec/Config object' as const

export const ACTUAL =
  'a mutable field on an Options/Spec/Config object: options-object fields are readonly; mutability escapes the author' as const

export const FIX = 'add the readonly modifier to the field' as const

export const OPTIONS_TYPE_SUFFIXES: ReadonlySet<string> = new Set([
  'Options',
  'Spec',
  'Config',
])

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Require the readonly modifier on every property inside an exported interface or type literal whose name ends in Options, Spec, or Config. Options-object fields are readonly; mutability escapes the author.',
  },
  schema: [],
  messages: {
    mutableOptionsField: MESSAGE,
  },
} as const
