import { JSONSchema, Schema as S } from 'effect'

export const Options = S.Struct({
  testDir: S.optionalWith(
    S.String,
    { default: () => '__tests__' },
  ),
})

export type OptionsType = S.Schema.Type<typeof Options>

export const WRONG_SUFFIX_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const PLAIN_IT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const RAW_FC_ASSERT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const WRONG_LOCATION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const EFFECT_PROP_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Property test files (*.property.test.ts) must use it.prop from @effect/vitest, not plain it, raw fc.assert, or it.effect.prop. Tests must be in a configurable __tests__ directory adjacent to the workflow.',
  },
  schema: [JSONSchema.make(Options)],
  messages: {
    wrongSuffix: WRONG_SUFFIX_MESSAGE,
    plainIt: PLAIN_IT_MESSAGE,
    rawFcAssert: RAW_FC_ASSERT_MESSAGE,
    effectProp: EFFECT_PROP_MESSAGE,
    wrongLocation: WRONG_LOCATION_MESSAGE,
  },
} as const
