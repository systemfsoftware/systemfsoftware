import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { banErrorString } from '../ban-error-string.js'

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

ruleTester.run('ban-error-string', banErrorString, {
  valid: [
    {
      name: 'Should_Pass_When_IsStringCallRejectsNonStringPatterns',
      code: `
        class F { #String(v) { return v }; make(error) { throw new Error(this.#String(error)) } }
        new Error('message')
        new Error(String())
        new Error(Number(error))
        new Error(globalThis.Number(error))
        new Error(globalThis['String'](error))
        new Error(((v) => v)(error))
        new ((() => Error)())('msg')
      `,
    },
    {
      name: 'Should_Pass_When_NonErrorLikeNames',
      code: `
        String(someValue)
        someValue.toString()
        \`\${someValue}\`
      `,
    },
    {
      name: 'Should_Pass_When_ToStringCallBoundaries',
      code: `
        const m = 'toString'
        error.toString(16)
        error[m]()
        error.valueOf()
      `,
    },
    {
      name: 'Should_Pass_When_TemplateLiteralBoundaries',
      code: `
        \`Error: \${error}\`
        \`\${error} happened\`
        \`\${error}\${error}\`
      `,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_NewErrorUsesStringIdentifierCallee',
      code: 'throw new Error(String(e))',
      errors: [
        {
          messageId: 'forbidden',
          data: {
            pattern: 'new Error(String(error))',
            expected: "new Error('message', { cause: error })",
            actual: 'new Error(String(e))',
            fix: 'replace String(error) with an explicit message and { cause: error }',
          },
          suggestions: [
            {
              messageId: 'useCause',
              data: { pattern: 'String(e)', replacement: "'Error occurred', { cause: e }" },
              output: "throw new Error('Error occurred', { cause: e })",
            },
          ],
        },
      ],
    },
    {
      name: 'Should_Report_When_NewErrorUsesMemberExpressionPaths',
      code: 'throw new Errors.NetworkError(globalThis.String(cause))',
      errors: [
        {
          messageId: 'forbidden',
          suggestions: [
            {
              messageId: 'useCause',
              output: "throw new Errors.NetworkError('Error occurred', { cause: cause })",
            },
          ],
        },
      ],
    },
    {
      name: 'Should_Report_When_StandaloneStringWrapsErrorLikeNames',
      code: `
        String(error)
        new Result(String(error))
      `,
      errors: [
        { messageId: 'standaloneStringWrap', data: { name: 'error' } },
        { messageId: 'standaloneStringWrap', data: { name: 'error' } },
      ],
    },
    {
      name: 'Should_Report_When_ToStringOrTemplateLiteralCoercesError',
      code: `
        error.toString()
        \`\${error}\`
      `,
      errors: [
        { messageId: 'toStringWrap', data: { name: 'error' } },
        { messageId: 'templateLiteralWrap', data: { name: 'error' } },
      ],
    },
  ],
})
