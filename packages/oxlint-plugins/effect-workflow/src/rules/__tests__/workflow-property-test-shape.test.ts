import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowPropertyTestShape } from '../workflow-property-test-shape.js'

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

const validProp = `
import { it } from '@effect/vitest'
import { Arbitrary } from 'effect'
it.prop('refund never exceeds capture', [Arbitrary.make(ProcessClaimCommand)], ([cmd]) => {
  const result = processClaim(cmd)
  return true
})
`

const plainItData = {
  name: 'it()',
  expected: 'it.prop() from @effect/vitest for workflow property tests',
  actual: 'plain it() is used',
  fix: 'replace it() with it.prop() from @effect/vitest',
}

const rawFcAssertData = {
  name: 'fc.assert()',
  expected: 'it.prop() from @effect/vitest',
  actual: 'raw fc.assert() is used',
  fix: 'replace raw fc.assert() with it.prop() from @effect/vitest',
}

const wrongLocationData = (basename: string, testDir: string, actualDir: string) => ({
  name: basename,
  expected: `${testDir}/${basename} adjacent to the workflow`,
  actual: `${basename} is under ${actualDir}/ instead of ${testDir}/`,
  fix: `move ${basename} into ${testDir}/ adjacent to the workflow`,
})

ruleTester.run('workflow-property-test-shape', workflowPropertyTestShape, {
  valid: [
    {
      code: validProp,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `const x = 1`,
      filename: 'src/workflows/process-claim.workflow.ts',
    },
    {
      code: `const x = 1`,
      filename: 'src/workflows/__tests__/process-claim.helper.ts',
    },
    {
      code:
        `import { it } from '@effect/vitest'; it.prop('test', [Arbitrary.make(Schema), Arbitrary.make(Other)], ([a, b]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `import { it } from '@effect/vitest'; it.prop('test', [Arbitrary.make(Schema)], ([x]) => true, extraArg)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `import { it } from '@effect/vitest'; it.prop('test', [Arbitrary.make(Schema)], ([x]) => true, extraArg)`,
      filename: 'src/workflows/custom-tests/other.property.test.ts',
      options: [{ testDir: 'custom-tests' }],
    },
    {
      code: `obj.it('test', () => {})`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `assert(fc.property(arb, (x) => true))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `obj.assert(fc.property(arb, (x) => true))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `import { it } from '@effect/vitest'; it.prop('test')`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `import { it } from '@effect/vitest'; it.prop('test', 'not-array')`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code:
        `import { it } from '@effect/vitest'; it.prop('test', [Arbitrary.make(Schema), otherArb], ([a, b]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `import { it } from '@effect/vitest'; it.prop('test', [myCustomArb], ([x]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `import { it } from '@effect/vitest'; it.prop('test', [myCustomArb])`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `foo['it']('test', () => {})`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `fc['assert'](fc.property(arb, (x) => true))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `foo.effect.prop('test', [Arbitrary.make(Schema)], ([x]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `it.foo.prop('test', [Arbitrary.make(Schema)], ([x]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code:
        `import { it } from '@effect/vitest'; it.effect.prop('test', [Arbitrary.make(Schema)], ([x]) => Effect.gen(function*() { yield* true }))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      code: `import { it } from 'vitest'; it('runs the hook', () => {})`,
      filename: 'src/omp/plugins/omp-agent-discipline/__tests__/hook-dispatcher.feature.test.ts',
    },
    {
      code: `import fc from 'fast-check'; fc.assert(fc.property(arb, (x) => true))`,
      filename: 'src/foo.test.ts',
    },
  ],
  invalid: [
    {
      code: `import { it } from 'vitest'; it('should work', () => {})`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
      errors: [{ messageId: 'plainIt', data: plainItData }],
    },
    {
      code: `import fc from 'fast-check'; fc.assert(fc.property(arb, (x) => true))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
      errors: [{ messageId: 'rawFcAssert', data: rawFcAssertData }],
    },
    {
      code: `import { it } from '@effect/vitest'; it.prop('test', [Arbitrary.make(Schema)], ([x]) => true)`,
      filename: 'src/process-claim.property.test.ts',
      errors: [{
        messageId: 'wrongLocation',
        data: wrongLocationData('process-claim.property.test.ts', '__tests__', 'src'),
      }],
    },
    {
      code: `import { it } from '@effect/vitest'; it.prop('test', [Arbitrary.make(Schema)], ([x]) => true)`,
      filename: 'src/workflows/custom-tests/process-claim.property.test.ts',
      errors: [{
        messageId: 'wrongLocation',
        data: wrongLocationData('process-claim.property.test.ts', '__tests__', 'custom-tests'),
      }],
      options: [{ testDir: '__tests__' }],
    },
  ],
})
