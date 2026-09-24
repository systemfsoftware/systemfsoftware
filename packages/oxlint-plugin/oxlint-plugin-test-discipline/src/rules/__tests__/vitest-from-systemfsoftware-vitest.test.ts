import {
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
} from '../vitest-from-systemfsoftware-vitest.config.js'
import { vitestFromSystemfsoftwareVitest } from '../vitest-from-systemfsoftware-vitest.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const EXPECTED_DATA = {
  name: VIOLATION_NAME,
  expected: VIOLATION_EXPECTED,
  actual: VIOLATION_ACTUAL,
  fix: VIOLATION_FIX,
}

const refusal = { messageId: 'vitestImport', data: EXPECTED_DATA } as const

ruleTester.run('vitest-from-systemfsoftware-vitest', vitestFromSystemfsoftwareVitest, {
  valid: [
    {
      name: 'Should_Allow_ValueImports_When_SourceIsSystemfsoftwareVitest',
      code: `import { describe, expect, it, vi } from '@systemfsoftware/vitest'`,
    },
    {
      name: 'Should_Allow_NamespaceImport_When_SourceIsSystemfsoftwareVitest',
      code: `import * as vitest from '@systemfsoftware/vitest'`,
    },
    {
      name: 'Should_Allow_DynamicImport_When_SourceIsSystemfsoftwareVitest',
      code: `const vitest = await import('@systemfsoftware/vitest')`,
    },
    {
      name: 'Should_Allow_TypeOnlyDeclaration_When_SourceIsVitest',
      code: `import type { TestOptions, Vitest } from 'vitest'`,
    },
    {
      name: 'Should_Allow_InlineTypeSpecifiers_When_SourceIsVitest',
      code: `import { type TestOptions, type Vitest } from 'vitest'`,
    },
    {
      name: 'Should_Allow_TypeOnlyNamespace_When_SourceIsVitest',
      code: `import type * as V from 'vitest'`,
    },
    {
      name: 'Should_Allow_TypeOnlyDefault_When_SourceIsVitest',
      code: `import type Vitest from 'vitest'`,
    },
    {
      name: 'Should_Allow_ValueImport_When_SourceIsNotVitest',
      code: `import { expect } from './expect.js'`,
    },
    {
      name: 'Should_Allow_DynamicImport_When_SourceIsNotVitest',
      code: `const mod = await import('vitest-something')`,
    },
    {
      name: 'Should_Allow_ValueImport_When_TheFileIsTheForkItself',
      code: `import * as V from 'vitest'
export * from 'vitest'`,
      filename: '/repo/packages/vitest/src/mod.ts',
    },
    {
      name: 'Should_Allow_ValueImport_When_TheFileIsTheConformanceSuite',
      code: `import { describe, it } from 'vitest'`,
      filename: '/repo/packages/vitest-conformance/tests/lawful-properties.integration.test.ts',
    },
    {
      name: 'Should_Allow_ValueImport_When_ThePackageDrivesVitestDirectly',
      code: `import { describe } from 'vitest'`,
      filename: '/repo/packages/effect-spec-runtime/src/Register.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_NamedImport_When_SourceIsVitest',
      code: `import { vi } from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_AliasedNamedImport_When_SourceIsVitest',
      code: `import { expect as e } from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_RunnerImport_When_SourceIsVitest',
      code: `import { describe, it } from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_DefaultImport_When_SourceIsVitest',
      code: `import Vitest from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_NamespaceImport_When_SourceIsVitest',
      code: `import * as Vitest from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_SideEffectImport_When_SourceIsVitest',
      code: `import 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_EmptyNamedImport_When_SourceIsVitest',
      code: `import {} from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_MixedImport_When_ItCarriesAValueSpecifier',
      code: `import { vi, type Vitest } from 'vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_DynamicImport_When_SourceIsVitest',
      code: `const Vitest = await import('vitest')`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_ValueImport_When_TheFileIsNamedLikeASetupFile',
      code: `import { afterEach } from 'vitest'`,
      filename: '/repo/packages/atom/effect-atom-react/vitest-setup.ts',
      errors: [refusal],
    },
    {
      name: 'Should_Report_RunnerImport_When_SourceIsUpstreamEffectVitest',
      code: `import { it } from '@effect/vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_NamespaceImport_When_SourceIsUpstreamEffectVitest',
      code: `import * as V from '@effect/vitest'`,
      errors: [refusal],
    },
    {
      name: 'Should_Report_DynamicImport_When_SourceIsUpstreamEffectVitest',
      code: `const V = await import('@effect/vitest')`,
      errors: [refusal],
    },
  ],
})
