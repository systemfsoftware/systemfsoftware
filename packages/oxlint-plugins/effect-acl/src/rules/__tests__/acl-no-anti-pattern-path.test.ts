import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { aclNoAntiPatternPath } from '../acl-no-anti-pattern-path.js'

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
  expected:
    'the ACL under a capability-named directory (banned path segments: core, shell, util, utils, helper, manager, service)',
  actual: `a path segment matching the banned list: ${banned}`,
  fix:
    'move the file into a directory named for the bounded context it translates — the path should read as a capability, not a technology layer',
})

ruleTester.run('acl-no-anti-pattern-path', aclNoAntiPatternPath, {
  valid: [
    {
      name: 'Should_Pass_When_PlacedUnderCapabilityDirectory',
      code:
        `export const fromRow = S.transformOrFail(OrderRow, Order, { strict: true, decode: (r) => r, encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'no')) })`,
      filename: '/repo/pkg/src/orders/place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_PlacedDirectlyUnderSrc',
      code: ``,
      filename: '/repo/pkg/src/place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_PlacedUnderNestedCapabilityDirectory',
      code: ``,
      filename: '/repo/pkg/src/billing/place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_SegmentOnlyStartsWithBannedWord',
      code: ``,
      filename: '/repo/pkg/src/core-services/place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_SegmentIsConventionOnlyHelpers',
      code: ``,
      filename: '/repo/pkg/src/helpers/place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_NonAclFileSitsUnderBannedDirectory',
      code: `export const total = (a: number, b: number) => a + b`,
      filename: '/repo/pkg/src/core/money.ts',
    },
    {
      name: 'Should_Pass_When_OtherCellFileSitsUnderBannedDirectory',
      code: `export const load = (id: string) => id`,
      filename: '/repo/pkg/src/core/place-order.store.ts',
    },
    {
      name: 'Should_Pass_When_BareFilenameHasNoDirectorySegments',
      code: ``,
      filename: 'place-order.acl.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_PlacedUnderCore',
      code: ``,
      filename: '/repo/pkg/src/core/place-order.acl.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('place-order.acl.ts', 'core') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderShell',
      code: ``,
      filename: '/repo/pkg/src/shell/place-order.acl.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('place-order.acl.ts', 'shell') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderUtil',
      code: ``,
      filename: '/repo/pkg/src/util/place-order.acl.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('place-order.acl.ts', 'util') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderUtils',
      code: ``,
      filename: '/repo/pkg/src/utils/place-order.acl.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('place-order.acl.ts', 'utils') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderHelper',
      code: ``,
      filename: '/repo/pkg/src/helper/place-order.acl.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('place-order.acl.ts', 'helper') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderManager',
      code: ``,
      filename: '/repo/pkg/src/manager/place-order.acl.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('place-order.acl.ts', 'manager') }],
    },
    {
      name: 'Should_Report_When_PlacedUnderService',
      code: ``,
      filename: '/repo/pkg/src/service/place-order.acl.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('place-order.acl.ts', 'service') }],
    },
    {
      name: 'Should_Report_When_DeepNestingHitsBannedSegment',
      code: ``,
      filename: '/repo/pkg/src/order/manager/place-order.acl.ts',
      errors: [{ messageId: 'antiPatternPath', data: dataFor('place-order.acl.ts', 'manager') }],
    },
  ],
})
