import {
  MISSING_SNAPSHOT_ACTUAL,
  MISSING_SNAPSHOT_EXPECTED,
  MISSING_SNAPSHOT_FIX,
  MISSING_SNAPSHOT_NAME,
} from '../snapshot-test-requires-snapshot.config.js'
import { snapshotTestRequiresSnapshot } from '../snapshot-test-requires-snapshot.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

ruleTester.run('snapshot-test-requires-snapshot', snapshotTestRequiresSnapshot, {
  valid: [
    {
      name: 'Should_Allow_SnapshotTest_When_ToMatchSnapshotPresent',
      code: `
import { expect, it } from 'vitest'
it('pin', () => { expect('x').toMatchSnapshot() })
`,
      filename: '/repo/pkg/__tests__/bounded-union.snapshot.test.ts',
    },
    {
      name: 'Should_Allow_SnapshotTest_When_ToMatchInlineSnapshotPresent',
      code: `
import { expect, it } from 'vitest'
it('pin', () => { expect('x').toMatchInlineSnapshot(\`"x"\`) })
`,
      filename: '/repo/pkg/__tests__/bounded-union.snapshot.test.ts',
    },
    {
      name: 'Should_Allow_SnapshotTest_When_ToMatchFileSnapshotPresent',
      code: `
import { expect, it } from 'vitest'
it('pin', () => { expect('x').toMatchFileSnapshot('./snap.txt') })
`,
      filename: '/repo/pkg/__tests__/bounded-union.snapshot.test.ts',
    },
    {
      name: 'Should_Allow_SnapshotTest_When_ToThrowErrorMatchingSnapshotPresent',
      code: `
import { expect, it } from 'vitest'
it('pin', () => { expect(() => boom()).toThrowErrorMatchingSnapshot() })
`,
      filename: '/repo/pkg/__tests__/bounded-union.snapshot.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_SnapshotAssertionAbsent',
      code: `
import { it } from 'vitest'
it('plain', () => {})
`,
      filename: '/repo/pkg/__tests__/foo.integration.test.ts',
    },
    {
      name: 'Should_Allow_SrcPropertyTest_When_SnapshotAssertionAbsent',
      code: `
import { it } from 'vitest'
it('plain', () => {})
`,
      filename: '/repo/pkg/src/foo.workflow.property.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_SnapshotFile_When_NoSnapshotAssertion',
      code: `
import { expect, it } from 'vitest'
it('pin', () => { expect('x').toEqual('x') })
`,
      filename: '/repo/pkg/__tests__/bounded-union.snapshot.test.ts',
      errors: [{
        messageId: 'missingSnapshot',
        data: {
          name: MISSING_SNAPSHOT_NAME,
          expected: MISSING_SNAPSHOT_EXPECTED,
          actual: MISSING_SNAPSHOT_ACTUAL,
          fix: MISSING_SNAPSHOT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_SnapshotFile_When_OnlyImportsPresent',
      code: `
import { describe, it } from 'vitest'
`,
      filename: '/repo/pkg/__tests__/bounded-union.snapshot.test.ts',
      errors: [{
        messageId: 'missingSnapshot',
        data: {
          name: MISSING_SNAPSHOT_NAME,
          expected: MISSING_SNAPSHOT_EXPECTED,
          actual: MISSING_SNAPSHOT_ACTUAL,
          fix: MISSING_SNAPSHOT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_SnapshotFile_When_EmptyBody',
      code: '',
      filename: '/repo/pkg/__tests__/bounded-union.snapshot.test.ts',
      errors: [{
        messageId: 'missingSnapshot',
        data: {
          name: MISSING_SNAPSHOT_NAME,
          expected: MISSING_SNAPSHOT_EXPECTED,
          actual: MISSING_SNAPSHOT_ACTUAL,
          fix: MISSING_SNAPSHOT_FIX,
        },
      }],
    },
  ],
})
