import { MESSAGE } from './path.config.js'
export const NOT_MODULE_LEVEL_NAME = 'a nested `import.meta.vitest` block' as const
export const NOT_MODULE_LEVEL_EXPECTED = 'the in-source test block as a direct statement of the module body' as const
export const NOT_MODULE_LEVEL_ACTUAL = 'an `import.meta.vitest` block nested inside another statement' as const
export const NOT_MODULE_LEVEL_FIX =
  'move the block to module level — a nested block does not run under vitest includeSource' as const

export const NO_PRIVATE_TARGET_NAME = 'an `import.meta.vitest` block touching no module-level binding' as const
export const NO_PRIVATE_TARGET_EXPECTED =
  "an in-source test exercising this module's own code — a private helper, or an exported operation named in the `it.prop` `subject` slot" as const
export const NO_PRIVATE_TARGET_ACTUAL = 'an in-source block referencing only exported-call or imported names' as const
export const NO_PRIVATE_TARGET_FIX =
  'touch this module. A private helper is referenced directly; an exported operation is named in the `it.prop` `subject` slot beside its declaration — that is the one home for its laws and the file whose mutants they run. What the block cannot hold is a behaviour binding no module-level name: test the public surface from tests/ as a Gherkin behaviour test instead' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "In-source `if (import.meta.vitest)` blocks under src/ must be at module level and exercise this module's own code — a private helper, or an exported operation named in the `it.prop` `subject` slot; a public-surface test belongs in tests/ as a Gherkin behaviour test.",
  },
  schema: [],
  messages: {
    notModuleLevel: MESSAGE,
    noPrivateTarget: MESSAGE,
  },
} as const
