import { JSONSchema, Schema as S } from 'effect'

export const Options = S.Struct({
  testDir: S.optionalWith(
    S.String,
    { default: () => '__tests__' },
  ),
})

export type OptionsType = S.Schema.Type<typeof Options>

export const PLAIN_IT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const RAW_FC_ASSERT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const WRONG_LOCATION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Property test files (*.property.test.ts) must live in the configured test directory adjacent to the workflow and use it.prop from @effect/vitest, not plain it or raw fc.assert.',
  },
  schema: [JSONSchema.make(Options)],
  messages: {
    plainIt: PLAIN_IT_MESSAGE,
    rawFcAssert: RAW_FC_ASSERT_MESSAGE,
    wrongLocation: WRONG_LOCATION_MESSAGE,
  },
} as const
