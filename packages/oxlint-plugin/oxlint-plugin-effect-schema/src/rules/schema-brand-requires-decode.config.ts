export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const BRAND_EXPECTED = 'a brand behind a runtime decode' as const

export const BRAND_ACTUAL = 'Brand.nominal is `input as A` — zero validation' as const

export const BRAND_FIX =
  "decode through a Schema pipe (S.String.pipe(S.brand('X'))) so the brand stands behind a decode, or delete the brand when nothing needs the distinction" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A zero-decode brand constructor performs no runtime validation: Brand.nominal is a cast, and Brand.check or check called with zero checks degrades to nominal. A brand must stand behind a Schema decode.',
  },
  schema: [],
  messages: {
    zeroDecodeBrand: MESSAGE,
  },
} as const
