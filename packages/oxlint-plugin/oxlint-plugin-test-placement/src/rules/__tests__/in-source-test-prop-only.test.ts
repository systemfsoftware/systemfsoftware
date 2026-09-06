import {
  NON_PROP_CALL_ACTUAL,
  NON_PROP_CALL_EXPECTED,
  NON_PROP_CALL_FIX,
  NON_PROP_CALL_NAME,
} from '../in-source-test-prop-only.config.js'
import { inSourceTestPropOnly } from '../in-source-test-prop-only.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const nonPropCall = {
  messageId: 'nonPropCall',
  data: {
    name: NON_PROP_CALL_NAME,
    expected: NON_PROP_CALL_EXPECTED,
    actual: NON_PROP_CALL_ACTUAL,
    fix: NON_PROP_CALL_FIX,
  },
} as const

ruleTester.run('in-source-test-prop-only', inSourceTestPropOnly, {
  valid: [
    {
      name: 'Should_Allow_ItProp_When_BooleanPredicateInGuard',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  it.prop('Holds_ForOne', [helper(1)], ([v]) => v === 1)
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_ItEffectProp_When_BooleanPredicateInGuard',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  it.effect.prop('Holds_ForOne', [helper(1)], ([v]) => v === 1)
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_PropModifiers_When_SkipOnlyTodoOnPropChain',
      code: `
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  it.prop.skip('Skipped_Prop', [], () => true)
  it.prop.only('Only_Prop', [], () => true)
  it.effect.prop.todo('Todo_EffectProp', [], () => true)
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_SchemaAndFcCalls_When_InsidePropBlock',
      code: `
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Exit } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')
  const negative = fc.integer({ min: -100, max: -1 })
  it.prop(
    'NegativeLimit_Fails',
    [negative.map((limit) => ({ _tag: 'DynamicLimitExceeded' as const, limit }))],
    ([input]) => Exit.isFailure(decode(input)),
  )
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_UnresolvableRoot_When_ThisCallInGuard',
      code: `
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  it.prop('Holds_AfterSetup', [], () => this.setup() === true)
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_RunnerCall_When_OutsideAnyVitestGuard',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  it.prop('Holds_ForOne', [helper(1)], ([v]) => v === 1)
}
if (helper(0) > 0) {
  it('Outside_AnyGuard', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_NonPropCalls_When_OutsideSrc',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== void 0) {
  const { describe, expect, it } = await import('vitest')
  describe('helper', () => {
    it('Should_One_When_Zero', () => {
      expect(helper(0)).toBe(1)
    })
  })
}
`,
      filename: '/repo/pkg/lib/widget.ts',
    },
    {
      name: 'Should_Allow_NonPropCalls_When_TestFile',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== void 0) {
  const { describe, expect, it } = await import('vitest')
  describe('helper', () => {
    it('Should_One_When_Zero', () => {
      expect(helper(0)).toBe(1)
    })
  })
}
`,
      filename: '/repo/pkg/src/widget.test.ts',
    },
    {
      name: 'Should_Allow_ExampleText_When_OnlyInsideStringLiterals',
      code: `
const example = "it('Should_One_When_Zero', () => { expect(helper(0)).toBe(1) })"
export const doc = \`describe('helper', () => { \${example} })\`
`,
      filename: '/repo/pkg/src/widget.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_NonPropCall_When_DescribeInGuard',
      code: `
if (import.meta.vitest !== void 0) {
  const { describe } = await import('vitest')
  describe('helper', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [nonPropCall],
    },
    {
      name: 'Should_Report_NonPropCall_When_BareItInGuard',
      code: `
if (import.meta.vitest !== void 0) {
  const { it } = await import('vitest')
  it('Should_One_When_Zero', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [nonPropCall],
    },
    {
      name: 'Should_Report_NonPropCall_When_TestInGuard',
      code: `
if (import.meta.vitest !== void 0) {
  const { test } = await import('vitest')
  test('Should_One_When_Zero', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [nonPropCall],
    },
    {
      name: 'Should_Report_NonPropCall_When_ExpectChainInGuard',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== void 0) {
  const { expect } = await import('vitest')
  expect(helper(1)).toBe(2)
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [nonPropCall, nonPropCall],
    },
    {
      name: 'Should_Report_NonPropCall_When_ItEffectWithoutProp',
      code: `
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  it.effect('Only_Effect_NoProp', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [nonPropCall],
    },
    {
      name: 'Should_Report_NonPropCall_When_ItOnlyInGuard',
      code: `
if (import.meta.vitest !== void 0) {
  const { it } = await import('vitest')
  it.only('Only_Runner', () => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [nonPropCall],
    },
    {
      name: 'Should_Report_NonPropCall_When_ViCallInGuard',
      code: `
if (import.meta.vitest !== void 0) {
  const { vi } = await import('vitest')
  const f = vi.fn()
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [nonPropCall],
    },
    {
      name: 'Should_Report_NonPropCall_When_ExtendedRunnerRootsInGuard',
      code: `
if (import.meta.vitest !== void 0) {
  suite('widget', () => {})
  assert(1 === 1)
  beforeEach(() => {})
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [nonPropCall, nonPropCall, nonPropCall],
    },
    {
      // Known-bad fixture per KTD7: mirrors the Intensity.ts example block
      // shape (describe/it/expect over hand-picked inputs) that U3 triages.
      // describe + it + expect + toBe chain each earn their own report.
      name: 'Should_Report_NonPropCall_When_KnownBadExampleFixture',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== void 0) {
  const { describe, expect, it } = await import('vitest')
  describe('helper', () => {
    it('Should_One_When_Zero', () => {
      expect(helper(0)).toBe(1)
    })
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [nonPropCall, nonPropCall, nonPropCall, nonPropCall],
    },
  ],
})
