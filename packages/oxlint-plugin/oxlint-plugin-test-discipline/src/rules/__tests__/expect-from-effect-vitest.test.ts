import {
  EFFECT_VITEST_SOURCE,
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
} from '../expect-from-effect-vitest.config.js'
import { expectFromEffectVitest } from '../expect-from-effect-vitest.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const EXPECTED_DATA = {
  name: VIOLATION_NAME,
  expected: `${VIOLATION_EXPECTED} (imported from ${EFFECT_VITEST_SOURCE})`,
  actual: VIOLATION_ACTUAL,
  fix: VIOLATION_FIX,
}

ruleTester.run('expect-from-effect-vitest', expectFromEffectVitest, {
  valid: [
    {
      name: 'Should_Allow_ViImport_When_ExpectIsAbsent',
      code: `import { vi } from 'vitest'`,
    },
    {
      name: 'Should_Allow_ExpectImport_When_SourceIsEffectVitest',
      code: `import { expect } from '@effect/vitest'`,
    },
    {
      name: 'Should_Allow_OtherImports_When_SourceIsVitest',
      code: `import { describe, it } from 'vitest'`,
    },
    {
      name: 'Should_Allow_DefaultImport_When_SourceIsVitest',
      code: `import Vitest from 'vitest'`,
    },
    {
      name: 'Should_Allow_NamespaceImport_When_SourceIsVitest',
      code: `import * as Vitest from 'vitest'`,
    },
    {
      name: 'Should_Allow_ExpectNamedImport_When_SourceIsNotVitest',
      code: `import { expect } from './expect.js'`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ExpectImport_When_MixedWithVi',
      code: `import { expect, vi } from 'vitest'`,
      errors: [{ messageId: 'vitestExpect', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_ExpectImport_When_Aliased',
      code: `import { expect as e } from 'vitest'`,
      errors: [{ messageId: 'vitestExpect', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_ExpectImport_When_Alone',
      code: `import { expect } from 'vitest'`,
      errors: [{ messageId: 'vitestExpect', data: EXPECTED_DATA }],
    },
  ],
})
