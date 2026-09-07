import { BRAND_ACTUAL, BRAND_EXPECTED, BRAND_FIX } from './schema-brand-requires-decode.config.js'

const SCHEMA_FILE = '/repo/pkg/src/domain.ts'

const NOMINAL_NAME = 'Brand.nominal (a zero-validation cast)' as const

const MEMBER_CHECK_NAME = 'Brand.check() with no checks' as const

const BARE_CHECK_NAME = 'check() with no checks' as const

const zeroDecodeError = (name: string) => ({
  messageId: 'zeroDecodeBrand' as const,
  data: {
    name,
    expected: BRAND_EXPECTED,
    actual: BRAND_ACTUAL,
    fix: BRAND_FIX,
  },
})

export const SCHEMA_BRAND_REQUIRES_DECODE_INVALID = [
  {
    name: 'Should_Fail_When_BrandNominalFromEffect',
    code: `import { Brand } from 'effect'
export const make = Brand.nominal()`,
    filename: SCHEMA_FILE,
    errors: [zeroDecodeError(NOMINAL_NAME)],
  },
  {
    name: 'Should_Fail_When_AliasedBrandNominalFromEffect',
    code: `import { Brand as B } from 'effect'
export const make = B.nominal()`,
    filename: SCHEMA_FILE,
    errors: [zeroDecodeError(NOMINAL_NAME)],
  },
  {
    name: 'Should_Fail_When_BrandNominalFromBrandSubmodule',
    code: `import * as Brand from 'effect/Brand'
export const make = Brand.nominal()`,
    filename: SCHEMA_FILE,
    errors: [zeroDecodeError(NOMINAL_NAME)],
  },
  {
    name: 'Should_Fail_When_BrandCheckHasZeroChecks',
    code: `import { Brand } from 'effect'
export const make = Brand.check()`,
    filename: SCHEMA_FILE,
    errors: [zeroDecodeError(MEMBER_CHECK_NAME)],
  },
  {
    name: 'Should_Fail_When_BareCheckHasZeroChecks',
    code: `import { check } from 'effect/Brand'
export const make = check()`,
    filename: SCHEMA_FILE,
    errors: [zeroDecodeError(BARE_CHECK_NAME)],
  },
]
