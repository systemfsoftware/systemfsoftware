import plugin from '@systemfsoftware/oxlint-plugin-test-discipline'
import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const SETTINGS_KEY = '@systemfsoftware/oxlint-plugin-test-discipline'
const E2E_ROLE = { [SETTINGS_KEY]: { role: 'e2e' } } as const

const EXAMPLE_FILE = '/repo/pkg/tests/example.e2e.ts'

// The agent example imports the suite config by relative path; the live scaffold smoke covers it, not this file.
const EXAMPLE_SOURCE = `import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test('Should_ShowAHeading_When_TheHomePageOpens', async ({ app, screen }) => {
  await app.open('/')
  await expect(screen.getByRole('heading')).toBeVisible()
})
`

const NEUTRAL_TITLE_SOURCE = EXAMPLE_SOURCE.replace(
  'Should_ShowAHeading_When_TheHomePageOpens',
  'the page greets a visitor',
)

for (const [name, rule] of Object.entries(plugin.rules)) {
  ruleTester.run(name, rule, {
    valid: [
      {
        name: 'Should_Pass_When_TheScaffoldHomePageExampleIsLinted',
        code: EXAMPLE_SOURCE,
        filename: EXAMPLE_FILE,
        settings: E2E_ROLE,
      },
    ],
    invalid: [],
  })
}

ruleTester.run('damp-test-naming', plugin.rules['damp-test-naming'], {
  valid: [],
  invalid: [
    {
      name: 'Should_ReportMissingShouldPrefix_When_TheScaffoldTitleIsNotInTheDampForm',
      code: NEUTRAL_TITLE_SOURCE,
      filename: EXAMPLE_FILE,
      settings: E2E_ROLE,
      errors: [{ messageId: 'missingShouldPrefix' }],
    },
  ],
})
