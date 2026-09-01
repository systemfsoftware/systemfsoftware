import {
  GUARD_FORM_ACTUAL,
  GUARD_FORM_EXPECTED,
  GUARD_FORM_FIX,
  GUARD_FORM_NAME,
  NO_EMPTY_PLACEHOLDER_ACTUAL,
  NO_EMPTY_PLACEHOLDER_EXPECTED,
  NO_EMPTY_PLACEHOLDER_FIX,
  NO_EMPTY_PLACEHOLDER_NAME,
  PROPERTY_BAN_ACTUAL,
  PROPERTY_BAN_EXPECTED,
  PROPERTY_BAN_FIX,
  PROPERTY_BAN_NAME,
  SNAPSHOT_ONLY_ACTUAL,
  SNAPSHOT_ONLY_EXPECTED,
  SNAPSHOT_ONLY_FIX,
  SNAPSHOT_ONLY_NAME,
} from '../in-source-test-snapshot-only.config.js'
import { inSourceTestSnapshotOnly } from '../in-source-test-snapshot-only.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const propertyBanError = {
  messageId: 'propertyBan' as const,
  data: {
    name: PROPERTY_BAN_NAME,
    expected: PROPERTY_BAN_EXPECTED,
    actual: PROPERTY_BAN_ACTUAL,
    fix: PROPERTY_BAN_FIX,
  },
}
const snapshotOnlyError = {
  messageId: 'snapshotOnly' as const,
  data: {
    name: SNAPSHOT_ONLY_NAME,
    expected: SNAPSHOT_ONLY_EXPECTED,
    actual: SNAPSHOT_ONLY_ACTUAL,
    fix: SNAPSHOT_ONLY_FIX,
  },
}
const noEmptyPlaceholderError = {
  messageId: 'noEmptyPlaceholder' as const,
  data: {
    name: NO_EMPTY_PLACEHOLDER_NAME,
    expected: NO_EMPTY_PLACEHOLDER_EXPECTED,
    actual: NO_EMPTY_PLACEHOLDER_ACTUAL,
    fix: NO_EMPTY_PLACEHOLDER_FIX,
  },
}
const guardFormError = {
  messageId: 'guardForm' as const,
  data: {
    name: GUARD_FORM_NAME,
    expected: GUARD_FORM_EXPECTED,
    actual: GUARD_FORM_ACTUAL,
    fix: GUARD_FORM_FIX,
  },
}

const validSnapshotBlock = `
const double = (n: number): number => n * 2
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  it('Should_Double_When_Two', () => {
    expect(double(2)).toMatchInlineSnapshot(\`"4"\`)
  })
}
`

ruleTester.run('in-source-test-snapshot-only', inSourceTestSnapshotOnly, {
  valid: [
    {
      name: 'Should_Allow_SnapshotAssertion_When_AuthoredContent',
      code: validSnapshotBlock,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_SnapshotAssertion_When_NegatedExpectChain',
      code: `
const double = (n: number): number => n * 2
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  it('Should_Double_When_Two', () => {
    expect(double(2)).not.toMatchInlineSnapshot(\`"4"\`)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_GherkinStructure_When_SnapshotAssertions',
      code: `
if (import.meta.vitest) {
  const { describe, expect, it } = await import('vitest')
  const trim = (s: string): string => s.trim()
  describe('trim', () => {
    it('Should_Trim_When_SurroundingSpaces', () => {
      expect(trim(' a ')).toMatchInlineSnapshot(\`"a"\`)
    })
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_RuleOfSchemas_When_GeneratedLawCall',
      code: `
import { Schema as S } from 'effect'
if (import.meta.vitest) {
  const schema = S.Struct({ id: S.String })
  ruleOfSchemas('Money', schema)
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_RuleOfSchemasWithArbitrary_When_InsideGeneratedLaw',
      code: `
if (import.meta.vitest) {
  ruleOfSchemas('SelfCheck', Arbitrary)
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_StaySilent_When_BannedConstructsOutsideVitestGuard',
      code: `
const shape = (expectFn: (x: number) => { toBe: (y: number) => void }) => expectFn(1).toBe(1)
if (globalThis.vitest) {
  it.prop('outside', () => {})
  const one = fc.integer()
}
expectTypeOf(1).toBeNumber()
await import('node:assert')
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  it('ok', () => {
    expect(1).toMatchInlineSnapshot(\`"1"\`)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_StaySilent_When_BannedConstructsInPropertyTestFile',
      code: `
if (import.meta.vitest) {
  const { it } = await import('vitest')
  it.prop('holds', () => {})
  const x = FastCheck.sample()
  const y = fc.integer()
  const z: Arbitrary<number> = null as unknown as Arbitrary<number>
  await import('fast-check')
  await import('effect/testing')
  const { expect } = await import('vitest')
  expect(1).toBe(2)
  expectTypeOf(1).toBeNumber()
  await import('node:assert')
  it('throws', () => { throw new Error('x') })
  expect(1).toMatchInlineSnapshot()
}
`,
      filename: '/repo/pkg/src/widget.workflow.property.test.ts',
    },
    {
      name: 'Should_StaySilent_When_FileOutsideSrc',
      code: `
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  it.prop('holds', () => {})
  expect(1).toBe(2)
  expectTypeOf(1).toBeNumber()
  await import('node:assert')
  expect(1).toMatchInlineSnapshot()
}
`,
      filename: '/repo/pkg/lib/widget.ts',
    },
    {
      name: 'Should_Allow_AliasedExpect_When_CanonicalOnly',
      code: `
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  const e = expect
  const fold = (n: number): number => n
  it('folds', () => {
    e(fold(1)).toBe(2)
  })
  const matcher = expect.any(Number)
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_ExpectAnyMatcherFactory_When_BareExpectIdentifier',
      code: `
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  const fold = (n: number): number => n
  it('folds', () => {
    expect(fold(1)).toMatchInlineSnapshot(\`1\`)
    const matcher = expect.any(Number)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_NoVitestBlock_When_FileHasNoGuard',
      code: `export const double = (n: number): number => n * 2`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_SnapshotWithVoidCheck_When_GuardVaries',
      code: `
const double = (n: number): number => n * 2
if (import.meta.vitest !== void 0) {
  const { expect, it } = await import('vitest')
  it('doubles', () => {
    expect(double(2)).toMatchInlineSnapshot(\`"4"\`)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_MultipleSnapshots_When_AllAuthored',
      code: `
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  const a = (n: number) => n + 1
  const b = (n: number) => n * 2
  it('pins', () => {
    expect(a(1)).toMatchInlineSnapshot(\`2\`)
    expect(b(2)).toMatchInlineSnapshot(\`4\`)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_StaySilent_When_EffectTestingImportBindsOnlyTestClock',
      code: `
if (import.meta.vitest !== void 0) {
  const { expect, it } = await import('@effect/vitest')
  const { TestClock } = await import('effect/testing')
  it('pins', () => {
    void TestClock
    expect(1 + 1).toMatchInlineSnapshot(\`2\`)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_FastCheckDestructured_When_ValueBinding',
      code: `
if (import.meta.vitest) {
  const { x: FastCheck } = obj
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_FastCheckAsObjectKey_When_InVitestGuard',
      code: `
if (import.meta.vitest) {
  const obj = { FastCheck: 1, fc: 2, Arbitrary: 3 }
  void obj
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_FastCheckAsMemberProperty_When_InVitestGuard',
      code: `
if (import.meta.vitest) {
  const x = obj.FastCheck
  void x
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_PropMemberCall_When_BaseNotInRunnerNames',
      code: `
if (import.meta.vitest) {
  const someFn = () => {}
  someFn.prop('x', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_ComputedExpectTerminal_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  it('x', () => {
    expect(1)['toBe'](2)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_ThrowAtGuardTop_When_NotInTestBody',
      code: `
if (import.meta.vitest) {
  throw new Error('setup')
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_Rethrow_When_PropagatingCaughtFailure',
      code: `
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  it('propagates', () => {
    try {
      JSON.parse('junk')
    } catch (err) {
      throw err
    }
    expect(1 + 1).toMatchInlineSnapshot(\`2\`)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ItProp_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const { it } = await import('vitest')
  it.prop('holds', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        propertyBanError,
      ],
    },
    {
      name: 'Should_Report_ItEffectProp_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const { it } = await import('vitest')
  it.effect.prop('holds', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        propertyBanError,
      ],
    },
    {
      name: 'Should_Report_TestProp_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const { test } = await import('vitest')
  test.prop('holds', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        propertyBanError,
      ],
    },
    {
      name: 'Should_Report_FastCheck_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const sample = FastCheck.sample()
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        propertyBanError,
      ],
    },
    {
      name: 'Should_Report_Fc_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const int = fc.integer()
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        propertyBanError,
      ],
    },
    {
      name: 'Should_Report_Arbitrary_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const arb = Arbitrary.make(Schema.Number)
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        propertyBanError,
      ],
    },
    {
      name: 'Should_Report_FastCheckImport_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const fcModule = await import('fast-check')
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        propertyBanError,
      ],
    },
    {
      name: 'Should_Report_EffectTestingImport_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const { FastCheck } = await import('effect/testing')
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        propertyBanError,
      ],
    },
    {
      name: 'Should_Report_ToBe_When_InsideVitestGuard',
      code: `
const decide = (n: number): boolean => n > 0
if (import.meta.vitest) {
  const { it, expect } = await import('vitest')
  it('decides', () => {
    expect(decide(1)).toBe(true)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        snapshotOnlyError,
      ],
    },
    {
      name: 'Should_Report_ToMatchSnapshot_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const { it, expect } = await import('vitest')
  const shape = (n: number) => n
  it('shapes', () => {
    expect(shape(1)).toMatchSnapshot()
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        snapshotOnlyError,
      ],
    },
    {
      name: 'Should_Report_ToMatchFileSnapshot_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const { it, expect } = await import('vitest')
  const rendered = 'hello'
  it('renders', () => {
    expect(rendered).toMatchFileSnapshot('./expected.txt')
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        snapshotOnlyError,
      ],
    },
    {
      name: 'Should_Report_ExpectTypeOf_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const fold = (n: number): number => n
  expectTypeOf(fold).toBeFunction()
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        snapshotOnlyError,
      ],
    },
    {
      name: 'Should_Report_NodeAssertImport_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const assertModule = await import('node:assert')
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        snapshotOnlyError,
      ],
    },
    {
      name: 'Should_Report_NodeAssertStrictImport_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const assertModule = await import('node:assert/strict')
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        snapshotOnlyError,
      ],
    },
    {
      name: 'Should_Report_Throw_When_InsideTestBodyAndVitestGuard',
      code: `
if (import.meta.vitest) {
  const { it } = await import('vitest')
  it('rejects junk', () => {
    throw new Error('parse failed')
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        snapshotOnlyError,
      ],
    },
    {
      name: 'Should_Report_EmptyInlineSnapshot_When_NoArgument',
      code: `
if (import.meta.vitest) {
  const { it, expect } = await import('vitest')
  const fold = (n: number): number => n
  it('folds', () => {
    expect(fold(1)).toMatchInlineSnapshot()
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        noEmptyPlaceholderError,
      ],
    },
    {
      name: 'Should_Report_InterpolatedInlineSnapshot_When_TemplateLiteralComputesContent',
      code: `
if (import.meta.vitest) {
  const { it, expect } = await import('vitest')
  const tag = 'run'
  it('folds', () => {
    expect(tag).toMatchInlineSnapshot(\`\${tag}\`)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        noEmptyPlaceholderError,
      ],
    },
    {
      name: 'Should_Report_NegatedToBe_When_InsideVitestGuard',
      code: `
if (import.meta.vitest) {
  const { expect, it } = await import('vitest')
  it('x', () => {
    expect(1).not.toBe(2)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        snapshotOnlyError,
      ],
    },
    {
      name: 'Should_Report_ThrowInsideItEffect_When_MemberFormRunner',
      code: `
if (import.meta.vitest) {
  const { it } = await import('@effect/vitest')
  it.effect('x', () => {
    throw new Error('y')
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        snapshotOnlyError,
      ],
    },
    {
      name: 'Should_Report_ShortCircuitGuard_When_LogicalAndRunsTests',
      code: `
import.meta.vitest && (async () => {
  const { it } = await import('vitest')
  it('folds', () => {})
})()
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        guardFormError,
      ],
    },
    {
      name: 'Should_Report_TernaryGuard_When_ConditionalRunsTests',
      code: `
import.meta.vitest ? globalThis.it('folds', () => {}) : void 0
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        guardFormError,
      ],
    },
    {
      name: 'Should_Report_InvertedGuard_When_ElseBranchRunsTests',
      code: `
if (!import.meta.vitest) {
  void 0
} else {
  const { it } = await import('vitest')
  it('folds', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        guardFormError,
      ],
    },
    {
      name: 'Should_Report_PropertyConstruct_When_InsideRuleOfSchemasCallbackArgument',
      code: `
if (import.meta.vitest) {
  ruleOfSchemas('X', async () => {
    const { Arbitrary } = await import('fast-check')
    void Arbitrary
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        propertyBanError,
        propertyBanError,
      ],
    },
    {
      name: 'Should_Report_BoundGuard_When_MetaVitestAssignedToVariable',
      code: `
const inVitest = import.meta.vitest
if (inVitest) {
  const { it } = await import('vitest')
  it('folds', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [
        guardFormError,
      ],
    },
  ],
})
