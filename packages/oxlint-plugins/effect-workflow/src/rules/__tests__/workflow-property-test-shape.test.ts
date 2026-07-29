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

ruleTester.run('workflow-property-test-shape', workflowPropertyTestShape, {
  valid: [
    {
      name: 'Should_Pass_When_ItPropShapesArbitraryList',
      code: validProp,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_FilenameIsNonPropertyTestWorkflow',
      code: `const x = 1`,
      filename: 'src/workflows/process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_FilenameIsNonTestHelperFile',
      code: `const x = 1`,
      filename: 'src/workflows/__tests__/process-claim.helper.ts',
    },
    {
      name: 'Should_Pass_When_ItPropCarriesMultipleArbitraryInstances',
      code:
        `import { it } from '@effect/vitest'; it.prop('test', [Arbitrary.make(Schema), Arbitrary.make(Other)], ([a, b]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItPropHasExtraArgument',
      code: `import { it } from '@effect/vitest'; it.prop('test', [Arbitrary.make(Schema)], ([x]) => true, extraArg)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_CalleeIsMemberAccessForIt',
      code: `obj.it('test', () => {})`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_AssertIsCalledWithoutFcObject',
      code: `assert(fc.property(arb, (x) => true))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_AssertIsCalledViaMemberExpression',
      code: `obj.assert(fc.property(arb, (x) => true))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItPropHasNoArguments',
      code: `import { it } from '@effect/vitest'; it.prop('test')`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItPropArbitraryListIsNotArray',
      code: `import { it } from '@effect/vitest'; it.prop('test', 'not-array')`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItPropArbitraryListContainsNonArbitraryItems',
      code:
        `import { it } from '@effect/vitest'; it.prop('test', [Arbitrary.make(Schema), otherArb], ([a, b]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItPropUsesCustomArbitraryInstance',
      code: `import { it } from '@effect/vitest'; it.prop('test', [myCustomArb], ([x]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItPropUsesCustomArbitraryWithMissingCallback',
      code: `import { it } from '@effect/vitest'; it.prop('test', [myCustomArb])`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItIsAccessedViaComputedString',
      code: `foo['it']('test', () => {})`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_AssertIsAccessedViaComputedString',
      code: `fc['assert'](fc.property(arb, (x) => true))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItPropIsCalledOnArbitraryLikeNamespace',
      code: `foo.effect.prop('test', [Arbitrary.make(Schema)], ([x]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItPropNamespaceIsChainedFromImportedIt',
      code: `it.foo.prop('test', [Arbitrary.make(Schema)], ([x]) => true)`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_ItEffectPropCarriesEffectGenBody',
      code:
        `import { it } from '@effect/vitest'; it.effect.prop('test', [Arbitrary.make(Schema)], ([x]) => Effect.gen(function*() { yield* true }))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
    },
    {
      name: 'Should_Pass_When_NonPropertyTestFileUsesPlainIt',
      code: `import { it } from 'vitest'; it('runs the hook', () => {})`,
      filename: 'src/omp/plugins/omp-agent-discipline/__tests__/hook-dispatcher.feature.test.ts',
    },
    {
      name: 'Should_Pass_When_NonPropertyTestFileUsesRawFcAssert',
      code: `import fc from 'fast-check'; fc.assert(fc.property(arb, (x) => true))`,
      filename: 'src/foo.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_ReportPlainIt_When_CalledInPropertyTestFile',
      code: `import { it } from 'vitest'; it('should work', () => {})`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
      errors: [{ messageId: 'plainIt', data: plainItData }],
    },
    {
      name: 'Should_ReportRawFcAssert_When_CalledInPropertyTestFile',
      code: `import fc from 'fast-check'; fc.assert(fc.property(arb, (x) => true))`,
      filename: 'src/workflows/__tests__/process-claim.property.test.ts',
      errors: [{ messageId: 'rawFcAssert', data: rawFcAssertData }],
    },
  ],
})
