import { behaviourExercisesUseCase } from '../behaviour-exercises-use-case.js'
import { behaviourOneFeaturePerFile } from '../behaviour-one-feature-per-file.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const PURE_ONLY = `import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { normalizeToolName } from './tool-name.kernel.js'

const Feature = makeFeature({ it, layer })
Feature('x', () => {
  normalizeToolName('write')
})
`

const SHELL_ONLY = `import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { runHookDispatcher } from '../src/hook-dispatcher.executor.js'

const Feature = makeFeature({ it, layer })
Feature('x', () => {
  runHookDispatcher()
})
`

ruleTester.run('handcheck-pure-only-shell', behaviourExercisesUseCase, {
  valid: [],
  invalid: [
    {
      name: 'HandCheck_PureOnly_TriggersNoShellImport',
      code: PURE_ONLY,
      filename: '/repo/pkg/__tests__/handcheck.integration.test.ts',
      errors: [{ messageId: 'noShellImport' }],
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
