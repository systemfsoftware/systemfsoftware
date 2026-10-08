import { a11yGateOn } from '../a11y-gate-on.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const STORY = '/repo/pkg/ui/shell/a.stories.tsx'

ruleTester.run('a11y-gate-on', a11yGateOn, {
  valid: [
    {
      name: 'Should_StaySilent_When_A11yTestIsError',
      code: "export default { parameters: { a11y: { test: 'error' } } }",
      filename: STORY,
    },
    {
      name: 'Should_StaySilent_When_A11yTestIsErrorAndDisableIsFalse',
      code: "export default { parameters: { a11y: { test: 'error', disable: false } } }",
      filename: STORY,
    },
    {
      name: 'Should_StaySilent_When_A11yObjectIsEmpty',
      code: 'export default { parameters: { a11y: {} } }',
      filename: STORY,
    },
    {
      name: 'Should_StaySilent_When_NonA11yObjectCarriesTheTestKey',
      code: "export default { parameters: { foo: { test: 'todo' } } }",
      filename: STORY,
    },
    {
      name: 'Should_StaySilent_When_A11yTestIsNotALiteral',
      code: 'export default { parameters: { a11y: { test: level } } }',
      filename: STORY,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_A11yTestIsTodo',
      code: "export default { parameters: { a11y: { test: 'todo' } } }",
      filename: STORY,
      errors: [{ messageId: 'a11yTestNotError', data: { actual: 'todo' } }],
    },
    {
      name: 'Should_Report_When_A11yTestIsOff',
      code: "export default { parameters: { a11y: { test: 'off' } } }",
      filename: STORY,
      errors: [{ messageId: 'a11yTestNotError', data: { actual: 'off' } }],
    },
    {
      name: 'Should_Report_When_A11yDisableIsTrue',
      code: 'export default { parameters: { a11y: { disable: true } } }',
      filename: STORY,
      errors: [{ messageId: 'a11yDisabled' }],
    },
    {
      name: 'Should_Report_When_A11yTestIsTodoAndDisableIsTrue',
      code: "export default { parameters: { a11y: { test: 'todo', disable: true } } }",
      filename: STORY,
      errors: [
        { messageId: 'a11yTestNotError', data: { actual: 'todo' } },
        { messageId: 'a11yDisabled' },
      ],
    },
  ],
})
