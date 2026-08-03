export const EFFECT_CONTEXT_MODULE = 'effect' as const
export const CONTEXT_NAMESPACE = 'Context' as const
export const GENERIC_TAG = 'GenericTag' as const

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Ban Context.GenericTag from Effect - use Context.Tag instead',
  },
  schema: [],
  messages: {
    banned: "'{{name}}' is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.",
  },
} as const
