import { MESSAGE } from './path.config.js'

export const HELPER_EXPECTED =
  'non-test helper and fixture modules under tests/ to live inside tests/__fixtures__/' as const
export const HELPER_ACTUAL = 'a non-test module in tests/ outside __fixtures__/' as const
export const HELPER_FIX =
  'move it under tests/__fixtures__/ — *.schema.ts if it declares schemas, <stem>.workflow.ts if it constructs a workflow' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Under tests/, the only non-test modules are helpers and fixtures, and they live inside tests/__fixtures__/.',
  },
  schema: [],
  messages: {
    helperOutsideFixtures: MESSAGE,
  },
} as const
