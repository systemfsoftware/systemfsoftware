export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'a resource or handle module whose module scope holds only immutable definitions — every driver-carrying state lives inside the kind' as const

export const REBINDING_ACTUAL = 'a module-level `let` or `var` binding' as const
export const COLLECTION_ACTUAL_OF = (call: string): string => `a module-level mutable collection (${call})` as const
export const REF_ACTUAL = 'a module-level `Ref`' as const

export const REBINDING_FIX =
  'make the binding a `const`; state a handle or resource carries belongs inside the definition, never at module scope' as const
export const COLLECTION_FIX =
  'build the collection inside the definition (a `create`, `prepare` or operation) so each acquired instance owns its own state' as const
export const REF_FIX =
  'mint the Ref inside the definition so each acquired instance owns its own state; a module-level Ref is shared by every instance' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Resource and handle files hold no module-level mutable state (R22): no module-level let/var, no module-level mutable collection, no module-level Ref.',
  },
  schema: [],
  messages: {
    moduleState: MESSAGE,
  },
} as const
