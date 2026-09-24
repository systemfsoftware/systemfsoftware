export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'a blueprint or handle module that declares no Context.Service, Context.Tag, or Context.Key — the file carries no ambient environment identity' as const

export const actualOf = (kind: string, name: string): string => `a ${kind} declaration (\`${name}\`)` as const

export const FIX =
  'model the live instance as the handle value the blueprint projects (`yield* spec.scoped`), and provide it with `spec.layer(key)` where a Context identity is genuinely wanted (resource-vs-handle-duality.md §2: a handle is a value, not an environment identifier)' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Blueprint and handle files declare no Context.Service, Context.Tag, or Context.Key; a handle is an ephemeral value bound to a Scope, never a singleton environment identity.',
  },
  schema: [],
  messages: {
    serviceDeclaration: MESSAGE,
  },
} as const
