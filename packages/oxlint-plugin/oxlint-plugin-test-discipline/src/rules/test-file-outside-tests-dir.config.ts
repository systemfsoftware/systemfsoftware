import { MESSAGE, SANCTIONED_TEST_DIRS } from './path.config.js'

const SANCTIONED_DIRS = [...SANCTIONED_TEST_DIRS].map((dir) => `${dir}/`).join(' or ')

export const STRAY_TEST_FILE_EXPECTED = `test files outside src/ under a ${SANCTIONED_DIRS} directory`
export const STRAY_TEST_FILE_ACTUAL = 'a test file outside src/ and outside any tests directory' as const
export const STRAY_TEST_FILE_FIX = `move it into the package ${SANCTIONED_DIRS} directory`

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Test files outside src/ must live under a tests/ directory; free-standing test files have no sanctioned home.',
  },
  schema: [],
  messages: {
    strayTestFile: MESSAGE,
  },
} as const
