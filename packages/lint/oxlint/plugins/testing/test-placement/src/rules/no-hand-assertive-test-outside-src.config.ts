import { MESSAGE } from './path.config.js'

export const HAND_ASSERTIVE_EXPECTED =
  'a snapshot test (toMatchSnapshot, toMatchInlineSnapshot, or toMatchFileSnapshot) or the sanctioned generated file surface.snapshot.test.ts' as const
export const HAND_ASSERTIVE_ACTUAL = 'a hand-assertive test file under tests/ with no snapshot matcher call' as const
export const HAND_ASSERTIVE_FIX =
  'snapshot it — replace hand assertions with toMatchSnapshot, toMatchInlineSnapshot, or toMatchFileSnapshot, or delete it; a hand-assertive suite outside src/ is deleted, not written' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Under tests/, a test file must be snapshot-shaped (calls toMatchSnapshot, toMatchInlineSnapshot, or toMatchFileSnapshot) or be the sanctioned generated file surface.snapshot.test.ts',
  },
  schema: [],
  messages: {
    handAssertiveOutsideSrc: MESSAGE,
  },
} as const
