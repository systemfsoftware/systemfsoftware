import { JSONSchema, Schema as S } from 'effect'

export const Options = S.Struct({
  testDir: S.optionalWith(
    S.String,
    { default: () => '__tests__' },
  ),
})

export type OptionsType = S.Schema.Type<typeof Options>

export const WRONG_SUFFIX_MESSAGE = 'Test file {{file}} must use *.property.test.ts suffix for workflow tests.' as const
export const PLAIN_IT_MESSAGE =
  'Use it.prop() from @effect/vitest instead of plain it() for workflow property tests.' as const
export const RAW_FC_ASSERT_MESSAGE =
  'Use it.prop() from @effect/vitest instead of raw fc.assert(). Property tests need Effect context.' as const
export const WRONG_LOCATION_MESSAGE =
  'Property test files must be in a {{testDir}}/ directory adjacent to the workflow file.' as const
export const EFFECT_PROP_MESSAGE =
  'Use it.prop() from @effect/vitest instead of it.effect.prop() — workflows are pure, no Effect context needed.' as const

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
