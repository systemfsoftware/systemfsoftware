export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const BRAND_EXPECTED =
  'a brand placed after the runtime check it claims — a filter, check (or minLength, maxLength, pattern) earlier in the same pipe chain, or an already-refined base such as Int or Finite' as const

export const BRAND_ACTUAL =
  'a Schema.brand whose underlying chain carries no refinement, so the branded type claims more than decoding verifies' as const

export const BRAND_FIX =
  'pipe the check ahead of the brand in the same chain — S.filter or S.check before S.brand — or brand the refined member the claim depends on; when no check backs the claim, delete the brand and use the underlying schema' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A Schema.brand sits behind a runtime check in the same pipe chain: a filter, check, minLength, maxLength, or pattern earlier in the chain, or an already-refined base. A brand over a bare primitive with nothing behind it reports.',
  },
  schema: [],
  messages: {
    brandWithoutFilter: MESSAGE,
  },
} as const
