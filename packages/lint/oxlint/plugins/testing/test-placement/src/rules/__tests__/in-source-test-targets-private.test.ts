// `await import('vitest')` is the canonical in-source vitest pattern that the
// rule being tested (packages/effect-gherkin-spec/src/feature-runtime.ts:365
// and core/src/rules/no-io-boundary-tests.ts:18 are the two existing users).
// Static import would defeat the test purpose — the guard is what makes the
// block dead code at build time.
import {
  NO_PRIVATE_TARGET_ACTUAL,
  NO_PRIVATE_TARGET_EXPECTED,
  NO_PRIVATE_TARGET_FIX,
  NO_PRIVATE_TARGET_NAME,
  NOT_MODULE_LEVEL_ACTUAL,
  NOT_MODULE_LEVEL_EXPECTED,
  NOT_MODULE_LEVEL_FIX,
  NOT_MODULE_LEVEL_NAME,
} from '../in-source-test-targets-private.config.js'
import { inSourceTestTargetsPrivate } from '../in-source-test-targets-private.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

ruleTester.run('in-source-test-targets-private', inSourceTestTargetsPrivate, {
  valid: [
    {
      // A schema law: `refutes` discharges a generator obligation carried by the
      // exported schema beside it. No module-private binding is involved, and none
      // could be - the obligation belongs to that declaration.
      name: 'Should_Pass_When_ABlockDischargesASchemaLaw',
      code: `export const Admitted = 1
if (import.meta.vitest !== void 0) {
  const { refutes } = await import('@systemfsoftware/effect-schema-refutation')
  refutes(Admitted, {})
}`,
      filename: '/repo/pkg/src/Survivors.workflow.ts',
    },
    {
      name: 'Should_Allow_PrivateConst_Test_When_ModuleLevelGuard',
      code: `
const helper = (x: number): number => x + 1
export const publicFn = (x: number): number => x
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(helper(2)).toBe(3)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_PrivateFunction_Test_When_ModuleLevelGuard',
      code: `
function privateHelper(x: number): number { return x + 1 }
export const publicFn = (x: number): number => x
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(privateHelper(2)).toBe(3)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_NoVitestBlock_When_FileHasNone',
      code: `
const helper = (x: number): number => x + 1
export const publicFn = (x: number): number => x
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_GuardInPropertyTest_When_FilenameSanctioned',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== undefined) {
  const { it } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {})
}
`,
      filename: '/repo/pkg/src/widget.workflow.property.test.ts',
    },
    {
      name: 'Should_Allow_PrivateClass_Test_When_ModuleLevelBareGuard',
      code: `
class Helper { double(x: number): number { return x * 2 } }
export const publicFn = (x: number): number => x
if (import.meta.vitest) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(new Helper().double(2)).toBe(4)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_PrivateFunctionNotDeclaration_When_ModuleLevelGuard',
      code: `
function helper(x: number): number { return x + 1 }
export const publicFn = (x: number): number => x
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(helper(2)).toBe(3)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_TsEnum_Test_When_ModuleLevelGuard',
      code: `
enum Color { Red = 1, Green = 2 }
export const publicFn = (x: number): number => x
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Red_When_RedIsOne', () => {
    expect(Color.Red).toBe(1)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_NonExportedClassExpressionAssignedToConst_When_ModuleLevelGuard',
      code: `
const Helper = class { double(x: number): number { return x * 2 } }
export const publicFn = (x: number): number => x
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(new Helper().double(2)).toBe(4)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
    {
      name: 'Should_Allow_AnyFileOutsideSrc_When_RuleInactive',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(helper(2)).toBe(3)
  })
}
`,
      filename: '/repo/pkg/lib/widget.ts',
    },
    {
      name: 'Should_Allow_StringNamedReExport_When_LocalNameStaysPrivate',
      code: `
const helper = (x: number): number => x + 1
export { 'other' as o } from './other.js'
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_DoubleWhenPassedTwo', () => {
    expect(helper(2)).toBe(3)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_NoPrivateTarget_When_OnlyExportedReferenced',
      code: `
export const publicFn = (x: number): number => x
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(publicFn(2)).toBe(3)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [{
        messageId: 'noPrivateTarget',
        data: {
          name: NO_PRIVATE_TARGET_NAME,
          expected: NO_PRIVATE_TARGET_EXPECTED,
          actual: NO_PRIVATE_TARGET_ACTUAL,
          fix: NO_PRIVATE_TARGET_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_NoPrivateTarget_When_OnlyImportedReferenced',
      code: `
import { publicFn } from './public.js'
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(publicFn(2)).toBe(3)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [{
        messageId: 'noPrivateTarget',
        data: {
          name: NO_PRIVATE_TARGET_NAME,
          expected: NO_PRIVATE_TARGET_EXPECTED,
          actual: NO_PRIVATE_TARGET_ACTUAL,
          fix: NO_PRIVATE_TARGET_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_NoPrivateTarget_When_ReExportedBindingCountsAsExported',
      code: `
const helper = (x: number): number => x + 1
export { helper }
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(helper(2)).toBe(3)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [{
        messageId: 'noPrivateTarget',
        data: {
          name: NO_PRIVATE_TARGET_NAME,
          expected: NO_PRIVATE_TARGET_EXPECTED,
          actual: NO_PRIVATE_TARGET_ACTUAL,
          fix: NO_PRIVATE_TARGET_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_NotModuleLevel_When_GuardNestedInFunction',
      code: `
const helper = (x: number): number => x + 1
export const publicFn = async (): Promise<void> => {
  if (import.meta.vitest !== undefined) {
    const { it } = await import('vitest')
    it('Should_Double_When_PassedTwo', () => {})
  }
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [{
        messageId: 'notModuleLevel',
        data: {
          name: NOT_MODULE_LEVEL_NAME,
          expected: NOT_MODULE_LEVEL_EXPECTED,
          actual: NOT_MODULE_LEVEL_ACTUAL,
          fix: NOT_MODULE_LEVEL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_NoPrivateTargetOnSecondGuardOnly_When_FirstHits',
      code: `
const helper = (x: number): number => x + 1
export const publicFn = (x: number): number => x
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_Double_When_PassedTwo', () => {
    expect(helper(2)).toBe(3)
  })
}
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_NotDouble_When_PassedTwo', () => {
    expect(publicFn(2)).toBe(3)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [{
        messageId: 'noPrivateTarget',
        data: {
          name: NO_PRIVATE_TARGET_NAME,
          expected: NO_PRIVATE_TARGET_EXPECTED,
          actual: NO_PRIVATE_TARGET_ACTUAL,
          fix: NO_PRIVATE_TARGET_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_NoPrivateTarget_When_PrivateReferencedOnlyAfterTheGuard',
      code: `
const helper = (x: number): number => x + 1
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_NotUseHelper', () => {
    expect(1).toBe(1)
  })
}
export const fn = (): number => helper(1)
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [{
        messageId: 'noPrivateTarget',
        data: {
          name: NO_PRIVATE_TARGET_NAME,
          expected: NO_PRIVATE_TARGET_EXPECTED,
          actual: NO_PRIVATE_TARGET_ACTUAL,
          fix: NO_PRIVATE_TARGET_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_NoPrivateTarget_When_PlainIfIsNotAVitestGuard',
      code: `
const helper = (x: number): number => x + 1
if (helper(1) > 0) {
  globalThis.console.log('not a guard')
}
if (import.meta.vitest !== undefined) {
  const { it, expect } = await import('vitest')
  it('Should_DoubleWhenPassedTwo', () => {
    expect(1).toBe(1)
  })
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [{
        messageId: 'noPrivateTarget',
        data: {
          name: NO_PRIVATE_TARGET_NAME,
          expected: NO_PRIVATE_TARGET_EXPECTED,
          actual: NO_PRIVATE_TARGET_ACTUAL,
          fix: NO_PRIVATE_TARGET_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_NoPrivateTarget_When_OldLawSpecifierInsideRefutesBlockIsNotExempt',
      code: `export const Admitted = 1
if (import.meta.vitest !== void 0) {
  const { refutes } = await import('@systemfsoftware/effect-schema-law')
  refutes(Admitted, {})
}`,
      filename: '/repo/pkg/src/Survivors.workflow.ts',
      errors: [{
        messageId: 'noPrivateTarget',
        data: {
          name: NO_PRIVATE_TARGET_NAME,
          expected: NO_PRIVATE_TARGET_EXPECTED,
          actual: NO_PRIVATE_TARGET_ACTUAL,
          fix: NO_PRIVATE_TARGET_FIX,
        },
      }],
    },
  ],
})
