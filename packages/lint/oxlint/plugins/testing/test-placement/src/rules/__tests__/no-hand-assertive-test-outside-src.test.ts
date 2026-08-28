import {
  HAND_ASSERTIVE_ACTUAL,
  HAND_ASSERTIVE_EXPECTED,
  HAND_ASSERTIVE_FIX,
} from '../no-hand-assertive-test-outside-src.config.js'
import { noHandAssertiveTestOutsideSrc } from '../no-hand-assertive-test-outside-src.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const handAssertive = (name: string) => [
  {
    messageId: 'handAssertiveOutsideSrc' as const,
    data: {
      name,
      expected: HAND_ASSERTIVE_EXPECTED,
      actual: HAND_ASSERTIVE_ACTUAL,
      fix: HAND_ASSERTIVE_FIX,
    },
  },
]

ruleTester.run('no-hand-assertive-test-outside-src', noHandAssertiveTestOutsideSrc, {
  valid: [
    {
      name: 'Should_StaySilent_When_SnapshotMatcherPresent_ToMatchSnapshot',
      filename: '/repo/pkg/tests/foo.test.ts',
      code: `import { expect, test } from 'vitest'\ntest('x', () => { expect(x).toMatchSnapshot() })\n`,
    },
    {
      name: 'Should_StaySilent_When_SnapshotMatcherPresent_ToMatchInlineSnapshot',
      filename: '/repo/pkg/tests/foo.test.ts',
      code: `import { expect, test } from 'vitest'\ntest('x', () => { expect(x).toMatchInlineSnapshot() })\n`,
    },
    {
      name: 'Should_StaySilent_When_SnapshotMatcherPresent_ToMatchFileSnapshot',
      filename: '/repo/pkg/tests/foo.test.ts',
      code:
        `import { expect } from 'vitest'\ntest('x', async () => { await expect(x).toMatchFileSnapshot('./snap.txt') })\n`,
    },
    {
      name: 'Should_StaySilent_When_SanctionedBasename_AllowancePreMatcher',
      filename: '/repo/pkg/tests/surface.snapshot.test.ts',
      code: `import { expect, test } from 'vitest'\ntest('x', () => { expect(x).toBe(1) })\n`,
    },
    {
      name: 'Should_StaySilent_When_SanctionedBasename_WithSnapshotAlso',
      filename: '/repo/pkg/tests/surface.snapshot.test.ts',
      code: `test('x', () => { expect(x).toMatchSnapshot() })\n`,
    },
    {
      name: 'Should_StaySilent_When_FileIsInSrc',
      filename: '/repo/pkg/src/foo.test.ts',
      code: `import { expect, test } from 'vitest'\ntest('x', () => { expect(x).toBe(1) })\n`,
    },
    {
      name: 'Should_StaySilent_When_FileIsInSrcTestsDirUnderSrc',
      filename: '/repo/pkg/src/tests/foo.test.ts',
      code: `test('x', () => { expect(x).toBe(1) })\n`,
    },
    {
      name: 'Should_StaySilent_When_FileIsInDoubleUnderscoreTests',
      filename: '/repo/pkg/__tests__/foo.test.ts',
      code: `test('x', () => { expect(x).toBe(1) })\n`,
    },
    {
      name: 'Should_StaySilent_When_FileIsNotTestFile_UnderTests',
      filename: '/repo/pkg/tests/helper.ts',
      code: `export const x = 1\n`,
    },
    {
      name: 'Should_StaySilent_When_NestedTestsDir_WithSnapshot',
      filename: '/repo/pkg/tests/nested/foo.test.ts',
      code: `test('x', () => { expect(x).toMatchFileSnapshot('./s.txt') })\n`,
    },
    {
      name: 'Should_StaySilent_When_ComputedSnapshotAccess_NotCounted_AsFailureBlocked',
      filename: '/repo/pkg/tests/foo.test.ts',
      code: `test('x', () => { expect(x)['toMatchSnapshot']() })\n`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_HandAssertiveTestOutsideSrc_NoSnapshot',
      filename: '/repo/pkg/tests/foo.test.ts',
      code: `import { expect, test } from 'vitest'\ntest('x', () => { expect(x).toBe(1) })\n`,
      errors: handAssertive('foo.test.ts'),
    },
    {
      name: 'Should_Report_When_HandAssertive_IntegrationSuffix_NoSnapshot',
      filename: '/repo/pkg/tests/foo.integration.test.ts',
      code: `test('x', () => { expect(x).toEqual({ a: 1 }) })\n`,
      errors: handAssertive('foo.integration.test.ts'),
    },
    {
      name: 'Should_Report_When_HandAssertive_NestedUnderTests_NoSnapshot',
      filename: '/repo/pkg/tests/sub/foo.test.ts',
      code: `test('x', () => { expect(x).toBe(1) })\n`,
      errors: handAssertive('foo.test.ts'),
    },
    {
      name: 'Should_Report_When_OnlyNonSnapshotMatchersPresent',
      filename: '/repo/pkg/tests/foo.test.ts',
      code: `test('x', () => { expect(x).toBe(1); expect(y).toEqual(2) })\n`,
      errors: handAssertive('foo.test.ts'),
    },
  ],
})
