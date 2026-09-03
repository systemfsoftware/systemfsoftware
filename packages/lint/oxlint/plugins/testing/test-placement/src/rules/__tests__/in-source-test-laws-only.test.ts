import { createRuleTester } from './_tester.js'

import {
  COMMENT_TOKEN_ACTUAL,
  COMMENT_TOKEN_EXPECTED,
  COMMENT_TOKEN_FIX,
  COMMENT_TOKEN_NAME,
  EXPORTED_CALLEE_ACTUAL,
  EXPORTED_CALLEE_EXPECTED,
  EXPORTED_CALLEE_FIX,
  EXPORTED_CALLEE_NAME,
  GLOBAL_AUGMENTATION_ACTUAL,
  GLOBAL_AUGMENTATION_EXPECTED,
  GLOBAL_AUGMENTATION_FIX,
  GLOBAL_AUGMENTATION_NAME,
  GUARD_BODY_NOT_LAWS_ACTUAL,
  GUARD_BODY_NOT_LAWS_EXPECTED,
  GUARD_BODY_NOT_LAWS_FIX,
  GUARD_BODY_NOT_LAWS_NAME,
  NON_CANONICAL_GUARD_ACTUAL,
  NON_CANONICAL_GUARD_EXPECTED,
  NON_CANONICAL_GUARD_FIX,
  NON_CANONICAL_GUARD_NAME,
  SNAPSHOT_ASSERTION_ACTUAL,
  SNAPSHOT_ASSERTION_EXPECTED,
  SNAPSHOT_ASSERTION_FIX,
  SNAPSHOT_ASSERTION_NAME,
  TEST_VOCABULARY_ACTUAL,
  TEST_VOCABULARY_EXPECTED,
  TEST_VOCABULARY_FIX,
  TEST_VOCABULARY_NAME,
  VITEST_IMPORT_ACTUAL,
  VITEST_IMPORT_EXPECTED,
  VITEST_IMPORT_FIX,
  VITEST_IMPORT_NAME,
} from '../in-source-test-laws-only.config.js'
import { inSourceTestLawsOnly } from '../in-source-test-laws-only.js'

const ruleTester = createRuleTester()

const SRC_FILE = '/repo/pkg/src/main/host/bindMount.ts'

const vitestImport = () => ({
  messageId: 'vitestImport',
  data: {
    name: VITEST_IMPORT_NAME,
    expected: VITEST_IMPORT_EXPECTED,
    actual: VITEST_IMPORT_ACTUAL,
    fix: VITEST_IMPORT_FIX,
  },
})

const vocabulary = () => ({
  messageId: 'testVocabulary',
  data: {
    name: TEST_VOCABULARY_NAME,
    expected: TEST_VOCABULARY_EXPECTED,
    actual: TEST_VOCABULARY_ACTUAL,
    fix: TEST_VOCABULARY_FIX,
  },
})

const snapshot = () => ({
  messageId: 'snapshotAssertion',
  data: {
    name: SNAPSHOT_ASSERTION_NAME,
    expected: SNAPSHOT_ASSERTION_EXPECTED,
    actual: SNAPSHOT_ASSERTION_ACTUAL,
    fix: SNAPSHOT_ASSERTION_FIX,
  },
})

const nonCanonical = () => ({
  messageId: 'nonCanonicalGuard',
  data: {
    name: NON_CANONICAL_GUARD_NAME,
    expected: NON_CANONICAL_GUARD_EXPECTED,
    actual: NON_CANONICAL_GUARD_ACTUAL,
    fix: NON_CANONICAL_GUARD_FIX,
  },
})

const guardBody = () => ({
  messageId: 'guardBodyNotLaws',
  data: {
    name: GUARD_BODY_NOT_LAWS_NAME,
    expected: GUARD_BODY_NOT_LAWS_EXPECTED,
    actual: GUARD_BODY_NOT_LAWS_ACTUAL,
    fix: GUARD_BODY_NOT_LAWS_FIX,
  },
})

const commentToken = () => ({
  messageId: 'commentToken',
  data: {
    name: COMMENT_TOKEN_NAME,
    expected: COMMENT_TOKEN_EXPECTED,
    actual: COMMENT_TOKEN_ACTUAL,
    fix: COMMENT_TOKEN_FIX,
  },
})

const augmentation = () => ({
  messageId: 'globalAugmentation',
  data: {
    name: GLOBAL_AUGMENTATION_NAME,
    expected: GLOBAL_AUGMENTATION_EXPECTED,
    actual: GLOBAL_AUGMENTATION_ACTUAL,
    fix: GLOBAL_AUGMENTATION_FIX,
  },
})

const exportedCallee = () => ({
  messageId: 'exportedCallee',
  data: {
    name: EXPORTED_CALLEE_NAME,
    expected: EXPORTED_CALLEE_EXPECTED,
    actual: EXPORTED_CALLEE_ACTUAL,
    fix: EXPORTED_CALLEE_FIX,
  },
})

const LAWS_ONLY_MODULE = `
import { catalog } from '@systemfsoftware/in-source-catalog'

const decideMount = (input: { unit: string }) => ({ ok: true, unit: input.unit })

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'decideMount',
    run: decideMount,
    reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) => ({ unit: envFilePath })),
    refused: (result) => !result.ok,
  })
}
`

ruleTester.run('in-source-test-laws-only', inSourceTestLawsOnly, {
  valid: [
    {
      name: 'Should_StaySilent_When_ModuleIsLawsOnly',
      code: LAWS_ONLY_MODULE,
      filename: SRC_FILE,
    },
    {
      name: 'Should_StaySilent_When_ModuleHasNoTestVocabulary',
      code: `
const decideMount = (input: { unit: string }) => ({ ok: true, unit: input.unit })
export const decide = decideMount
`,
      filename: SRC_FILE,
    },
    {
      name: 'Should_StaySilent_When_VitestImportsLiveInTestsTree',
      code: `
import { expect, it } from 'vitest'

it('pins the bind', () => {
  expect(bindMount(validInput()).envPath).toBe('/var/run/app.sock')
})
`,
      filename: '/repo/pkg/tests/bindMount.integration.test.ts',
    },
    {
      name: 'Should_StaySilent_When_SnapshotLivesInTestsTree',
      code: `
import { expect, it } from 'vitest'

it('pins the shape', () => {
  expect(bindMount(validInput())).toMatchInlineSnapshot()
})
`,
      filename: '/repo/pkg/tests/bindMount.integration.test.ts',
    },
    {
      name: 'Should_StaySilent_When_OtherInterfacesAugmentOtherNames',
      code: `
declare global {
  interface Window {
    catalog: unknown
  }
}

export {}
`,
      filename: SRC_FILE,
    },
    {
      name: 'Should_StaySilent_When_VitestTypesAreTypeOnlyImports',
      code: `
import type { it as EffectIt } from '@effect/vitest'
import type { Tester } from 'vitest'

export const run: (tester: Tester) => void = (tester) => tester('pins', () => {})
`,
      filename: SRC_FILE,
    },
    {
      name: 'Should_StaySilent_When_GuardHoldsPropertyChannel',
      code: `
import { FastCheck as fc } from 'effect/testing'

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')

  const trees = fc.integer({ min: 1, max: 32 }).chain((total) =>
    fc.tuple(fc.constant(total), fc.integer({ min: 0, max: total - 1 }))
  )

  it.prop('∀t_KernelHolds', [trees], ([total, failedIndex]) => restartIndicesFor('one_for_one', failedIndex, total).length === 1)
}
`,
      filename: SRC_FILE,
    },
    {
      name: 'Should_StaySilent_When_GeneratedChannelRegistersLaws',
      code: `
import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'

if (import.meta.vitest !== void 0) {
  const { expect, it: test } = await import('vitest')

  ruleOfSchemas('Hexish', Hexish).forEach(({ schema, law }) => {
    test.prop(law, [schema.toArbitrary()], ([value]) => {
      expect(schema.decode(value)).toBeTruthy()
      return true
    })
  })
}
`,
      filename: SRC_FILE,
    },
    {
      name: 'Should_StaySilent_When_RunBindsAnInternalExport',
      code: `
import { catalog } from '@systemfsoftware/in-source-catalog'

/** @internal */
export const decideMount = (input: { unit: string }) => ({ ok: true, unit: input.unit })

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'decideMount',
    run: decideMount,
    reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) => ({ unit: envFilePath })),
    refused: (result) => !result.ok,
  })
}
`,
      filename: SRC_FILE,
    },
    {
      name: 'Should_StaySilent_When_EffectTestingIsImportedStatically',
      code: `
import { FastCheck as fc } from 'effect/testing'

const decideMount = (input: { unit: string }) => ({ ok: true, unit: input.unit })

export const arbitraryUnit = fc.string()
`,
      filename: SRC_FILE,
    },
  ],
  invalid: [
    {
      name: 'Should_ReportStaticVitestImport_When_ModuleImportsVitest',
      code: `
import { expect, it } from 'vitest'

const decideMount = (input: { unit: string }) => ({ ok: true })
`,
      filename: SRC_FILE,
      errors: [vitestImport()],
    },
    {
      name: 'Should_ReportEffectVitestImport_When_ModuleImportsTheRunner',
      code: `
import { it } from '@effect/vitest'

const decideMount = (input: { unit: string }) => ({ ok: true })
`,
      filename: SRC_FILE,
      errors: [vitestImport()],
    },
    {
      name: 'Should_ReportHandAuthoredTest_When_ItCallAppearsInSrc',
      code: `
it('binds the wiki dir', () => {
  const m = bindMount(validInput())
  expect(m.envPath).toBe('/var/run/app.sock')
})
`,
      filename: SRC_FILE,
      errors: [vocabulary(), vocabulary()],
    },
    {
      name: 'Should_ReportFocusedVariant_When_ItOnlyAppearsInSrc',
      code: `
it.only('binds the wiki dir', () => {
  const m = bindMount(validInput())
  expect(m.envPath).toBe('/var/run/app.sock')
})
`,
      filename: SRC_FILE,
      errors: [vocabulary(), vocabulary()],
    },
    {
      name: 'Should_ReportInlineSnapshot_When_CapturedInSrc',
      code: `
expect(bindMount(validInput())).toMatchInlineSnapshot()
`,
      filename: SRC_FILE,
      errors: [snapshot(), vocabulary()],
    },
    {
      name: 'Should_ReportBareGuard_When_CollectionTokenIsBareTruthy',
      code: `
if (import.meta.vitest) {
  expect(decideMount(validInput()).ok).toBe(true)
}
`,
      filename: SRC_FILE,
      errors: [nonCanonical(), vocabulary()],
    },
    {
      name: 'Should_ReportDestructuredRunner_When_GuardIsDestructured',
      code: `
const { it } = import.meta.vitest

it('binds', () => {})
`,
      filename: SRC_FILE,
      errors: [nonCanonical(), vocabulary()],
    },
    {
      name: 'Should_ReportCommentToken_When_GuardTextAppearsInAComment',
      code: `
// if (import.meta.vitest !== void 0) { ... }
const decideMount = (input: { unit: string }) => ({ ok: true })
`,
      filename: SRC_FILE,
      errors: [commentToken()],
    },
    {
      name: 'Should_ReportGlobalAugmentation_When_ImportMetaGainsVitest',
      code: `
declare global {
  interface ImportMeta {
    vitest: unknown
  }
}

export {}
`,
      filename: SRC_FILE,
      errors: [augmentation()],
    },
    {
      name: 'Should_ReportGuardBody_When_ItHoldsExpectationsBesideLaws',
      code: `
import { catalog } from '@systemfsoftware/in-source-catalog'

const decideMount = (input: { unit: string }) => ({ ok: true, unit: input.unit })

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'decideMount',
    run: decideMount,
    reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) => ({ unit: envFilePath })),
    refused: (result) => !result.ok,
  })
  expect(decideMount({ unit: 'x' }).ok).toBe(true)
}
`,
      filename: SRC_FILE,
      errors: [vocabulary(), guardBody()],
    },
    {
      name: 'Should_ReportExportedCallee_When_RunBindsAnExport',
      code: `
import { catalog } from '@systemfsoftware/in-source-catalog'

export const decideMount = (input: { unit: string }) => ({ ok: true, unit: input.unit })

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'decideMount',
    run: decideMount,
    reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) => ({ unit: envFilePath })),
    refused: (result) => !result.ok,
  })
}
`,
      filename: SRC_FILE,
      errors: [exportedCallee()],
    },
    {
      name: 'Should_ReportImportedCallee_When_RunBindsAnImport',
      code: `
import { catalog } from '@systemfsoftware/in-source-catalog'
import { decideMount } from './decide.js'

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'decideMount',
    run: decideMount,
    reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) => ({ unit: envFilePath })),
    refused: (result: { ok: boolean }) => !result.ok,
  })
}
`,
      filename: SRC_FILE,
      errors: [exportedCallee()],
    },
    {
      name: 'Should_ReportEffectCase_When_GuardUsesItEffect',
      code: `
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')

  it.effect('Should_Track_When_Recording', () => tracker.record)
}
`,
      filename: SRC_FILE,
      errors: [vocabulary(), guardBody()],
    },
    {
      name: 'Should_ReportDescribe_When_WrappingPropertyRegistrations',
      code: `
if (import.meta.vitest !== void 0) {
  const { describe, it } = await import('vitest')

  describe('isWithinWindow', () => {
    it.prop('∀t_Window', [fc.integer()], (n) => n + 0 === n)
  })
}
`,
      filename: SRC_FILE,
      errors: [vocabulary(), guardBody()],
    },
    {
      name: 'Should_ReportExpect_When_UsedInsideAPropertyPredicate',
      code: `
if (import.meta.vitest !== void 0) {
  const { expect, it } = await import('vitest')

  it.prop('∀t_Kernel', [fc.integer()], (n) => {
    expect(kernel(n)).toBe(n)
    return true
  })
}
`,
      filename: SRC_FILE,
      errors: [vocabulary()],
    },
    {
      name: 'Should_ReportGuardImport_When_RunnerLoadsOutsideTheGuard',
      code: `
const { it } = await import('vitest')

if (import.meta.vitest !== void 0) {
  it.prop('∀t_Outside', [fc.integer()], (n) => n >= 0)
}
`,
      filename: SRC_FILE,
      errors: [vitestImport()],
    },
    {
      name: 'Should_ReportDynamicTestingImport_When_EffectTestingLoadsInsideTheGuard',
      code: `
if (import.meta.vitest !== void 0) {
  const { FastCheck: fc } = await import('effect/testing')
}
`,
      filename: SRC_FILE,
      errors: [vitestImport()],
    },
    {
      name: 'Should_ReportExportedCallee_When_RunBindsAMemberOfAnImport',
      code: `
import { catalog } from '@systemfsoftware/in-source-catalog'
import * as someModule from './decide.js'

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'decideMount',
    run: someModule.decideMount,
    reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) => ({ unit: envFilePath })),
    refused: (result) => !result.ok,
  })
}
`,
      filename: SRC_FILE,
      errors: [exportedCallee()],
    },
    {
      name: 'Should_ReportExportedCallee_When_RunBindsAnAliasOfAnExport',
      code: `
import { catalog } from '@systemfsoftware/in-source-catalog'

export const exportedDecide = (input: { unit: string }) => ({ ok: true, unit: input.unit })

const internalRef = exportedDecide

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'decideMount',
    run: internalRef,
    reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) => ({ unit: envFilePath })),
    refused: (result) => !result.ok,
  })
}
`,
      filename: SRC_FILE,
      errors: [exportedCallee()],
    },
    {
      name: 'Should_ReportExportedCallee_When_RunWrapsAnExportInAnArrow',
      code: `
import { catalog } from '@systemfsoftware/in-source-catalog'

export const exportedDecide = (input: { unit: string }) => ({ ok: true, unit: input.unit })

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'decideMount',
    run: (input: { unit: string }) => exportedDecide(input),
    reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) => ({ unit: envFilePath })),
    refused: (result) => !result.ok,
  })
}
`,
      filename: SRC_FILE,
      errors: [exportedCallee()],
    },
  ],
})
