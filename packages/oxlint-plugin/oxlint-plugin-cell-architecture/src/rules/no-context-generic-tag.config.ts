export const EFFECT_CONTEXT_MODULE = 'effect' as const
export const CONTEXT_NAMESPACE = 'Context' as const
export const GENERIC_TAG = 'GenericTag' as const

export const EXPECTED = 'Context.Service' as const
export const ACTUAL = 'Context.GenericTag' as const
export const FIX =
  "declare the service as `class X extends Context.Service<X, Shape>()('id', { make })` - v4's Context exports Key, Service and Reference, and no Tag at all" as const

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Ban Context.GenericTag - a v4 service is declared with Context.Service',
  },
  schema: [],
  messages: {
    banned: "'{{name}}' is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.",
  },
} as const
