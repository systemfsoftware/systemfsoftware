import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  ANTI_PATTERN_PATH_ACTUAL_PREFIX,
  ANTI_PATTERN_PATH_EXPECTED,
  ANTI_PATTERN_PATH_FIX,
} from '../shape-no-anti-pattern-path.config.js'
import { shapeNoAntiPatternPath } from '../shape-no-anti-pattern-path.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const dataFor = (name: string, banned: string) => ({
  name,
  expected: ANTI_PATTERN_PATH_EXPECTED,
  actual: `${ANTI_PATTERN_PATH_ACTUAL_PREFIX} ${banned}`,
  fix: ANTI_PATTERN_PATH_FIX,
})

ruleTester.run('shape-no-anti-pattern-path', shapeNoAntiPatternPath, {
  valid: [
    {
      name: 'Should_Pass_When_PlacedUnderCapabilityDirectory',
      code:
        `import { integer, pgTable } from 'drizzle-orm/pg-core'\nexport const scans = pgTable('scans', { id: integer('id') })`,
      filename: '/repo/pkg/src/orders/scans.shape.ts',
    },
    {
      name: 'Should_Pass_When_PlacedDirectlyUnderSrc',
      code: ``,
      filename: '/repo/pkg/src/scans.shape.ts',
    },
    {
      name: 'Should_Pass_When_PlacedUnderNestedCapabilityDirectory',
      code: ``,
      filename: '/repo/pkg/src/billing/invoices/order.shape.ts',
    },
    {
      name: 'Should_Pass_When_SegmentOnlyStartsWithBannedWord',
      code: ``,
      filename: '/repo/pkg/src/core-services/order.shape.ts',
    },
    {
      name: 'Should_Pass_When_SegmentContainsBannedWordAsSuffix',
      code: ``,
      filename: '/repo/pkg/src/my-utils/order.shape.ts',
    },
    {
      name: 'Should_Pass_When_NonShapeFileSitsUnderBannedDirectory',
      code: `export const total = (a: number, b: number) => a + b`,
      filename: '/repo/pkg/src/core/money.ts',
    },
    {
      name: 'Should_Pass_When_OtherCellFileSitsUnderBannedDirectory',
      code: `export const load = (id: string) => id`,
      filename: '/repo/pkg/src/core/order.store.ts',
    },
    {
      name: 'Should_Pass_When_BareFilenameHasNoDirectorySegments',
      code: ``,
      filename: 'order.shape.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_PlacedUnderCore',
      code: ``,
      filename: '/repo/pkg/src/core/order.shape.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('order.shape.ts', 'core') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderShell',
      code: ``,
      filename: '/repo/pkg/src/shell/order.shape.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('order.shape.ts', 'shell') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderUtil',
      code: ``,
      filename: '/repo/pkg/src/util/order.shape.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('order.shape.ts', 'util') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderUtils',
      code: ``,
      filename: '/repo/pkg/src/utils/order.shape.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('order.shape.ts', 'utils') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderHelper',
      code: ``,
      filename: '/repo/pkg/src/helper/order.shape.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('order.shape.ts', 'helper') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderManager',
      code: ``,
      filename: '/repo/pkg/src/manager/order.shape.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('order.shape.ts', 'manager') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderService',
      code: ``,
      filename: '/repo/pkg/src/service/order.shape.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('order.shape.ts', 'service') }],
    },
    {
      name: 'Should_Report_When_BannedDirectoryIsNested',
      code: ``,
      filename: '/repo/pkg/src/billing/utils/order.shape.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('order.shape.ts', 'utils') }],
    },
  ],
})
