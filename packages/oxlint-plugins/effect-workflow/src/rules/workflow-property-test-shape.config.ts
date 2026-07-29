export const PLAIN_IT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const RAW_FC_ASSERT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Property test files (*.property.test.ts) must use it.prop from @effect/vitest, not plain it or raw fc.assert.',
  },
  schema: [],
  messages: {
    plainIt: PLAIN_IT_MESSAGE,
    rawFcAssert: RAW_FC_ASSERT_MESSAGE,
  },
} as const
