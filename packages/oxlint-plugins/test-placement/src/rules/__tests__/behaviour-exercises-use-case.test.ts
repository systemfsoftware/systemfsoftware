import {
  NO_SHELL_IMPORT_ACTUAL,
  NO_SHELL_IMPORT_EXPECTED,
  NO_SHELL_IMPORT_FIX,
  NO_SHELL_IMPORT_NAME,
} from '../behaviour-exercises-use-case.config.js'
import { behaviourExercisesUseCase } from '../behaviour-exercises-use-case.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const FEATURE_IMPORTS = `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'

const Feature = makeFeature({ it, layer })
`

ruleTester.run('behaviour-exercises-use-case', behaviourExercisesUseCase, {
  valid: [
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAnExecutor',
      code: `${FEATURE_IMPORTS}
import { hookDispatcher } from '../src/hook-dispatcher.executor.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/hook.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAHandler',
      code: `${FEATURE_IMPORTS}
import { renderPrompt } from '../src/render.handler.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/render.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAnAdapter',
      code: `${FEATURE_IMPORTS}
import { fsLayer } from '../src/fs.adapter.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/fs.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAStore',
      code: `${FEATURE_IMPORTS}
import { openKv } from '../src/config.store.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/store.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAMiddleware',
      code: `${FEATURE_IMPORTS}
import { rateLimit } from '../src/rate-limit.middleware.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/rate.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAHandler',
      code: `${FEATURE_IMPORTS}
import { renderPrompt } from '../src/render.handler.tsx'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/render.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsThePackageMain',
      code: `${FEATURE_IMPORTS}
import { program } from '../src/main.ts'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/entry.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsThePackageIndex',
      code: `${FEATURE_IMPORTS}
import { mod } from '../src/index.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/entry.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsABarePackageOtherThanFoundations',
      code: `${FEATURE_IMPORTS}
import { createServer } from 'node:http'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/server.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ShellTokenInNonFinalPathSegment',
      code: `${FEATURE_IMPORTS}
import { util } from '../src/port/foo.executor.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/port.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_BareNonFoundationPackageImported',
      code: `${FEATURE_IMPORTS}
import { get } from 'lodash'

Feature('x', () => {})
`,
    },
    {
      name: 'Should_Allow_UnitTest_When_NotABehaviourTest',
      code: `
import { it } from 'vitest'
it('plain', () => {})
`,
      filename: '/repo/pkg/tests/foo.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsPlainSrcModule_UnderAdmitSrcImports',
      code: `${FEATURE_IMPORTS}
import { fromImage } from '../../src/generic-container.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/parity/smoke.integration.test.ts',
      options: [{ admitSrcImports: true }],
    },
  ],
  invalid: [
    {
      name: 'Should_Report_IntegrationTest_When_ItOnlyImportsGherkinAndEffect',
      code: `${FEATURE_IMPORTS}
import { Effect } from 'effect'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/noop.integration.test.ts',
      errors: [{
        messageId: 'noShellImport',
        data: {
          name: NO_SHELL_IMPORT_NAME,
          expected: NO_SHELL_IMPORT_EXPECTED,
          actual: NO_SHELL_IMPORT_ACTUAL,
          fix: NO_SHELL_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_IntegrationTest_When_ItOnlyImportsVitestAndEffectVitest',
      code: `${FEATURE_IMPORTS}
import { expect } from 'vitest'
import { it as itVitest } from '@effect/vitest'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/noop.integration.test.ts',
      errors: [{
        messageId: 'noShellImport',
        data: {
          name: NO_SHELL_IMPORT_NAME,
          expected: NO_SHELL_IMPORT_EXPECTED,
          actual: NO_SHELL_IMPORT_ACTUAL,
          fix: NO_SHELL_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_IntegrationTest_When_BareFoundationPackageImported',
      code: `${FEATURE_IMPORTS}
import { expect } from 'vitest'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/noop.integration.test.ts',
      errors: [{
        messageId: 'noShellImport',
        data: {
          name: NO_SHELL_IMPORT_NAME,
          expected: NO_SHELL_IMPORT_EXPECTED,
          actual: NO_SHELL_IMPORT_ACTUAL,
          fix: NO_SHELL_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_IntegrationTest_When_ItHasNoImportsAtAll',
      code: `
const x = 1
`,
      filename: '/repo/pkg/__tests__/noop.integration.test.ts',
      errors: [{
        messageId: 'noShellImport',
        data: {
          name: NO_SHELL_IMPORT_NAME,
          expected: NO_SHELL_IMPORT_EXPECTED,
          actual: NO_SHELL_IMPORT_ACTUAL,
          fix: NO_SHELL_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_IntegrationTest_When_RelativeImportIsNotAShell',
      code: `${FEATURE_IMPORTS}
import { helper } from '../src/util.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/util.integration.test.ts',
      errors: [{
        messageId: 'noShellImport',
        data: {
          name: NO_SHELL_IMPORT_NAME,
          expected: NO_SHELL_IMPORT_EXPECTED,
          actual: NO_SHELL_IMPORT_ACTUAL,
          fix: NO_SHELL_IMPORT_FIX,
        },
      }],
    },
  ],
})
