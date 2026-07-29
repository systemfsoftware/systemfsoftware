import { MESSAGE } from './path.config.js'
export const NOT_MODULE_LEVEL_NAME = 'a nested `import.meta.vitest` block' as const
export const NOT_MODULE_LEVEL_EXPECTED = 'the in-source test block as a direct statement of the module body' as const
export const NOT_MODULE_LEVEL_ACTUAL = 'an `import.meta.vitest` block nested inside another statement' as const
export const NOT_MODULE_LEVEL_FIX =
  'move the block to module level — a nested block does not run under vitest includeSource' as const

export const NO_PRIVATE_TARGET_NAME = 'an `import.meta.vitest` block touching no private binding' as const
export const NO_PRIVATE_TARGET_EXPECTED = 'an in-source test exercising a non-exported module-level binding' as const
export const NO_PRIVATE_TARGET_ACTUAL = 'an in-source block referencing only exported or imported names' as const
export const NO_PRIVATE_TARGET_FIX =
  'test the public surface from tests/ as *.integration.test.ts; in-source blocks exist for private helpers only' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'In-source `if (import.meta.vitest)` blocks under src/ must be at module level and exercise at least one non-exported binding; other tests belong in tests/.',
  },
  schema: [],
  messages: {
    notModuleLevel: MESSAGE,
    noPrivateTarget: MESSAGE,
  },
} as const
