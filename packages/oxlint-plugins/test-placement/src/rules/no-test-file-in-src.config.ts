import { MESSAGE } from './path.config.js'

export const TEST_FILE_IN_SRC_NAME = '<basename>' as const
export const TEST_FILE_IN_SRC_EXPECTED = 'only *.property.test.ts test files under src/' as const
export const TEST_FILE_IN_SRC_ACTUAL = 'a test file under src/ that is not a property test' as const
export const TEST_FILE_IN_SRC_FIX =
  'move it to tests/ as *.integration.test.ts or *.feature.test.ts, or inline it as an `if (import.meta.vitest)` block exercising a private binding' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Under src/, only *.property.test.ts test files are allowed. Every other test form must move out of src/ or become an in-source vitest block testing private code.',
  },
  schema: [],
  messages: {
    testFileInSrc: MESSAGE,
  },
} as const
