import {
  NO_SUBJECT_IMPORT_ACTUAL,
  NO_SUBJECT_IMPORT_EXPECTED,
  NO_SUBJECT_IMPORT_FIX,
  NO_SUBJECT_IMPORT_NAME,
} from '../behaviour-exercises-use-case.config.js'
import { behaviourExercisesUseCase } from '../behaviour-exercises-use-case.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const FEATURE_IMPORTS = `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'

const Feature = makeFeature({ it, layer })
`

const errors = [
  {
    messageId: 'noSubjectImport',
    data: {
      name: NO_SUBJECT_IMPORT_NAME,
      expected: NO_SUBJECT_IMPORT_EXPECTED,
      actual: NO_SUBJECT_IMPORT_ACTUAL,
      fix: NO_SUBJECT_IMPORT_FIX,
    },
  },
]

ruleTester.run('behaviour-exercises-use-case', behaviourExercisesUseCase, {
  valid: [
    {
      // stryker-js/mutation-run — the forked-worker gate. The defect it exists to
      // catch lives ONLY in the emitted module layout, so importing `src/` could not
      // observe it; forking the built entry reaches the package through the artifact
      // its consumers run.
      name: 'Should_Pass_When_ABehaviourTestForksTheBuiltEntry',
      code: `import childProcess from 'node:child_process'
import { fileURLToPath } from 'node:url'
const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))
void childProcess.fork(DIST_DIR)`,
      filename: '/repo/pkg/tests/worker-bootstrap.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsItsOwnGherkinPackage',
      code: `${FEATURE_IMPORTS}
import { expandOutline } from '@systemfsoftware/effect-gherkin-spec'

Feature('x', () => { void expandOutline })
`,
      filename: '/repo/packages/testing/specs/gherkin/effect/tests/outline.integration.test.ts',
    },

    {
      // The reached module's role is not the rule's business - any package
      // module satisfies it, whatever the file is called.
      name: 'Should_Allow_IntegrationTest_When_ItImportsAPackageModule',
      code: `${FEATURE_IMPORTS}
import { hookDispatcher } from '../src/HookDispatcherExecutor.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/hook.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAPlainlyNamedCell',
      code: `${FEATURE_IMPORTS}
import { decide } from '../src/RestartDecision.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/restart.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsThePackageEntry',
      code: `${FEATURE_IMPORTS}
import { poll } from '../src/mod.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/poll.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsANonFoundationPackage',
      code: `${FEATURE_IMPORTS}
import { NodeFileSystem } from '@effect/platform-node'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/fs.integration.test.ts',
    },
    {
      // A dynamic import is a reach into the package just like a static one.
      name: 'Should_Allow_IntegrationTest_When_TheOnlyRouteToThePackageIsADynamicImport',
      code: `${FEATURE_IMPORTS}
Feature('x', async () => {
  await import('../src/hookDispatcher.js')
})
`,
      filename: '/repo/pkg/tests/hook.integration.test.ts',
    },
    {
      // A side-effect import executes the module it names, so it genuinely
      // reaches the package - whatever the package's top level does counts.
      name: 'Should_Allow_IntegrationTest_When_TheOnlySubjectReachIsASideEffectImport',
      code: `${FEATURE_IMPORTS}
import '../src/mod.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/poll.integration.test.ts',
    },
    {
      // An empty specifier list is the same side-effect import, spelled with
      // braces: the module still executes.
      name: 'Should_Allow_IntegrationTest_When_TheOnlySubjectReachIsAnEmptyNamedImport',
      code: `${FEATURE_IMPORTS}
import {} from '../src/mod.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/poll.integration.test.ts',
    },
    {
      // Deliberately unclosable: module existence is not observable from one
      // file (OX-TS2), so a relative import whose path names nothing on disk is
      // indistinguishable from a real side-effect import and satisfies the rule
      // the same way. The report copy says what the rule can and cannot see.
      name: 'Should_Allow_IntegrationTest_When_TheOnlySubjectImportMayNameANonexistentModule',
      code: `${FEATURE_IMPORTS}
import './ZzDoesNotExist.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/nothing.integration.test.ts',
    },
    {
      // Only *.integration.test.ts carries the obligation.
      name: 'Should_Ignore_APropertyTest_When_ItImportsOnlyEffect',
      code: `
import { Effect } from 'effect'
import { FastCheck as fc } from 'effect/testing'
`,
      filename: '/repo/pkg/src/__tests__/x.workflow.property.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_ReportViolation_When_EveryImportIsScaffolding',
      code: `${FEATURE_IMPORTS}
import { expect } from 'vitest'
import { Effect } from 'effect'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/nothing.integration.test.ts',
      errors,
    },
    {
      // An effect subpath is the same dependency: admitting it would let a file
      // satisfy the rule by importing an arbitrary and asserting on it.
      name: 'Should_ReportViolation_When_TheOnlyNonRunnerImportIsAnEffectSubpath',
      code: `${FEATURE_IMPORTS}
import { FastCheck as fc } from 'effect/testing'
import { Schema } from 'effect/Schema'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/arbitrary.integration.test.ts',
      errors,
    },
    {
      name: 'Should_ReportViolation_When_TheFileImportsNothingAtAll',
      code: `
const Feature = () => {}
Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/empty.integration.test.ts',
      errors,
    },
    {
      // `import type` is erased at runtime: it reaches the package's type
      // surface, never its code, so it cannot satisfy the reach obligation.
      name: 'Should_ReportViolation_When_TheOnlyNonRunnerImportIsTypeOnly',
      code: `${FEATURE_IMPORTS}
import type { X } from '../src/Thing.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/nothing.integration.test.ts',
      errors,
    },
    {
      // A Node builtin is part of the environment, not of the package.
      name: 'Should_ReportViolation_When_TheOnlyNonRunnerImportIsANodeBuiltin',
      code: `${FEATURE_IMPORTS}
import { ok } from 'node:assert'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/nothing.integration.test.ts',
      errors,
    },
    {
      // Importing the file itself executes the test, not the package.
      name: 'Should_ReportViolation_When_TheOnlyNonRunnerImportIsTheFileItself',
      code: `${FEATURE_IMPORTS}
import './self.integration.test.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/tests/self.integration.test.ts',
      errors,
    },
  ],
})
