import { MESSAGE } from './path.config.js'

export const NON_PROP_CALL_NAME = 'a non-property test call inside an `import.meta.vitest` block' as const
export const NON_PROP_CALL_EXPECTED =
  'only `it.prop` or `it.effect.prop` member-chain calls (standard modifiers included) with boolean predicates' as const
export const NON_PROP_CALL_ACTUAL = 'a bare or member-chain test call other than `it.prop`/`it.effect.prop`' as const
export const NON_PROP_CALL_FIX =
  'delete the block — non-property in-source tests belong nowhere in `src/`; re-home a meaningful example through the cell public export as `*.integration.test.ts`, or rewrite a real invariant as `it.prop` over a schema-derived arbitrary' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'In-source `if (import.meta.vitest)` blocks under src/ must contain only `it.prop` or `it.effect.prop` calls; every other test call fails — delete the block or rewrite the invariant as a property.',
  },
  schema: [],
  messages: {
    nonPropCall: MESSAGE,
  },
} as const
