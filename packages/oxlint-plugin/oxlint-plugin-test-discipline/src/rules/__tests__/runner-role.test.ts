import { RuleTester } from 'oxlint/plugins-dev'
import { expect, it } from 'vitest'
import { testSuffixOutsideSrc } from '../test-suffix-outside-src.js'
import { vitestFromSystemfsoftwareVitest } from '../vitest-from-systemfsoftware-vitest.js'
import { createRuleTester } from './_tester.js'

type Rule = Parameters<RuleTester['run']>[1]

/**
 * The lint of one file with the runner role set as a rule option, as a thunk:
 * RuleTester registers each case through its static `it`, so the case is
 * captured here and run by the caller, whose assertion sees any configuration
 * error it throws.
 */
const lintWithRoleOption = (rule: Rule): () => void => {
  const cases: Array<() => void> = []
  const { describe: savedDescribe, it: savedIt } = RuleTester
  RuleTester.describe = (_name: string, body: () => void) => body()
  RuleTester.it = (_name: string, body: () => void) => {
    cases.push(body)
  }
  try {
    createRuleTester().run('runner-role', rule, {
      valid: [{
        code: `import { it } from 'vitest'\n`,
        filename: '/repo/pkg/tests/x.runner.test.ts',
        options: [{ role: 'vitest-runner' }],
      }],
      invalid: [],
    })
  } finally {
    RuleTester.describe = savedDescribe
    RuleTester.it = savedIt
  }
  return () => cases.forEach((body) => body())
}

it.each(
  [
    ['vitest-from-systemfsoftware-vitest', vitestFromSystemfsoftwareVitest],
    ['test-suffix-outside-src', testSuffixOutsideSrc],
  ] as const,
)('Should_RefuseTheConfig_When_TheRunnerRoleIsDeclaredOnTheRule_%s', (_name, rule) => {
  expect(lintWithRoleOption(rule)).toThrow('does not accept options')
})
