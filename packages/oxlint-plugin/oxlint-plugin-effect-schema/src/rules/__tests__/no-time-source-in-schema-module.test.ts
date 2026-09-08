import { createRuleTester } from './_tester.js'

import { TIME_SOURCE_ACTUAL, TIME_SOURCE_EXPECTED, TIME_SOURCE_FIX } from '../no-time-source-in-schema-module.config.js'
import { noTimeSourceInSchemaModule } from '../no-time-source-in-schema-module.js'

const ruleTester = createRuleTester()

const error = (name: string) => ({
  messageId: 'timeSourceInSchemaModule',
  data: {
    name,
    expected: TIME_SOURCE_EXPECTED,
    actual: TIME_SOURCE_ACTUAL,
    fix: TIME_SOURCE_FIX,
  },
})

ruleTester.run('no-time-source-in-schema-module', noTimeSourceInSchemaModule, {
  valid: [
    {
      name: 'Should_Pass_When_SchemaFileReadsNothing',
      code: `import { Schema as S } from 'effect'
export const Name = S.Struct({ name: S.String })`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ClockReadLivesOutsideSchemaModule',
      code: `export const stamp = Date.now()`,
      filename: '/repo/pkg/src/clock.ts',
    },
    {
      name: 'Should_Pass_When_CoinReadLivesOutsideSchemaModule',
      code: `export const coin = Math.random()`,
      filename: '/repo/pkg/src/coin.ts',
    },
    {
      name: 'Should_Pass_When_UnlistedDateMemberUsedInSchemaModule',
      code: `export const stamp = Date.parse('2026-01-01')`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_BareNowCallUsedInSchemaModule',
      code: `declare const now: () => number
export const stamp = now()`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_UuidReadLivesOutsideSchemaModule',
      code: `export const id = crypto.randomUUID()`,
      filename: '/repo/pkg/src/ids.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Fail_When_DateNowReadInSchemaModule',
      code: `export const stamp = Date.now()`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('a Date.now read in a schema module')],
    },
    {
      name: 'Should_Fail_When_MathRandomReadInSchemaModule',
      code: `export const coin = Math.random()`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('a Math.random read in a schema module')],
    },
    {
      name: 'Should_Fail_When_PerformanceNowReadInSchemaModule',
      code: `export const stamp = performance.now()`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('a performance.now read in a schema module')],
    },
    {
      name: 'Should_Fail_When_RandomUuidReadInSchemaModule',
      code: `export const id = crypto.randomUUID()`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('a crypto.randomUUID read in a schema module')],
    },
    {
      name: 'Should_Fail_When_ComputedNowReadInSchemaModule',
      code: `export const stamp = Date['now']()`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('a Date.now read in a schema module')],
    },
  ],
})
