import { behaviourExercisesUseCase } from '../behaviour-exercises-use-case.js'
import { behaviourOneFeaturePerFile } from '../behaviour-one-feature-per-file.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

// Reaching a pure cell still reaches the package, so the rule admits it. Whether
// that cell is the wrong altitude for a behaviour test is a review matter - the
// importing file's syntax cannot decide it.
const PURE_ONLY = `import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { normalizeToolName } from './ToolName.js'

const Feature = makeFeature({ it, layer })
Feature('x', () => {
  normalizeToolName('write')
})
`

const SCAFFOLD_ONLY = `import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })
Feature('x', () => {
  expect(Effect.succeed(1)).toBeDefined()
})
`

const SHELL_ONLY = `import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { runHookDispatcher } from '../src/HookDispatcherExecutor.js'

const Feature = makeFeature({ it, layer })
Feature('x', () => {
  runHookDispatcher()
})
`

ruleTester.run('handcheck-pure-only-shell', behaviourExercisesUseCase, {
  valid: [
    {
      name: 'HandCheck_PureOnly_ReachesThePackage',
      code: PURE_ONLY,
      filename: '/repo/pkg/tests/handcheck.integration.test.ts',
    },
  ],
  invalid: [
    {
      name: 'HandCheck_ScaffoldOnly_TriggersNoSubjectImport',
      code: SCAFFOLD_ONLY,
      filename: '/repo/pkg/tests/handcheck.integration.test.ts',
      errors: [{ messageId: 'noSubjectImport' }],
    },
  ],
})

ruleTester.run('handcheck-shell-clean-uses-case', behaviourExercisesUseCase, {
  valid: [
    {
      name: 'HandCheck_Shell_NotReportedByExercisesUseCase',
      code: SHELL_ONLY,
      filename: '/repo/pkg/__tests__/handcheck.integration.test.ts',
    },
  ],
  invalid: [],
})

ruleTester.run('handcheck-shell-clean-one-feature', behaviourOneFeaturePerFile, {
  valid: [
    {
      name: 'HandCheck_Shell_NotReportedByOneFeature',
      code: SHELL_ONLY,
      filename: '/repo/pkg/__tests__/handcheck.integration.test.ts',
    },
  ],
  invalid: [],
})
