export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'a blueprint or handle module whose module scope holds only immutable definitions — state lives inside the minted value, never in a module-level registry' as const

export const REBINDING_ACTUAL = 'a module-level `let` or `var` binding' as const
export const COLLECTION_ACTUAL_OF = (call: string): string => `a module-level mutable collection (${call})` as const
export const REF_ACTUAL = 'a module-level Ref' as const
export const MUTATED_LITERAL_ACTUAL_OF = (mutation: string): string =>
  `a module-level const holding an array or object that is later mutated (${mutation})` as const

export const REBINDING_FIX =
  'make the binding a `const`; state a blueprint or handle carries belongs inside the definition, never at module scope (handle-state-privacy.md: module-level mutable registries are forbidden)' as const
export const COLLECTION_FIX =
  'build the collection inside the definition or its operations, so each minted value owns its state (handle-state-privacy.md: module-level mutable registries are forbidden)' as const
export const REF_FIX =
  'mint the Ref inside the definition or its operations, so each minted value owns its state; a module-level Ref is shared by every fiber and test in the process (handle-state-privacy.md)' as const
export const MUTATED_LITERAL_FIX =
  'keep the literal immutable, or build it inside the definition or its operations so each minted value owns its state (handle-state-privacy.md)' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Blueprint and handle files hold no module-level mutable state: no module-level let/var, no module-level mutable collection, no module-level Ref, and no module-level array or object that is mutated later.',
  },
  schema: [],
  messages: {
    moduleState: MESSAGE,
  },
} as const
