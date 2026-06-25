import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noDirectTagAccess } from '../no-direct-tag-access.js'

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

const defaultError = (name: string) => [
  {
    messageId: 'forbidden' as const,
    data: {
      name,
      expected:
        'Effect Match API or type guards — Match.tag(value, { Tag1: () => ... }), Result.isSuccess/Result.isFailure, Either.isLeft/Either.isRight, Exit.isSuccess/Exit.isFailure, Option.isSome/Option.isNone',
      actual: 'direct _tag property access',
      fix:
        'Replace obj._tag === "X" with Match.tag(obj, { X: () => ... }) or use Result.isSuccess/isFailure, Either.isLeft/isRight, Exit.isSuccess/isFailure, Option.isSome/isNone as appropriate',
    },
  },
]

ruleTester.run('no-direct-tag-access', noDirectTagAccess, {
  valid: [
    // Non-_tag properties
    {
      name: 'allows access to non-_tag properties',
      code: `const x = obj.name`,
    },
    {
      name: 'allows access to tag without underscore',
      code: `const x = obj.tag`,
    },
    {
      name: 'allows computed property with non-_tag value',
      code: `const x = obj["type"]`,
    },
    // Non-_tag property in comparison — isTagProperty guard
    {
      name: 'allows non-_tag property in comparison',
      code: `if (result.type === 'Success') {}`,
    },
    // Allow list
    {
      name: 'allows _tag comparison when in allow list',
      code: `if (result._tag === 'Foo') {}`,
      options: [{ allow: ['result._tag'] }],
    },
    // Pure value access — not in comparison or switch
    {
      name: 'allows _tag access as value assignment',
      code: `const x = result._tag`,
    },
    {
      name: 'allows _tag access on member expression as value',
      code: `const x = foo.bar._tag`,
    },
    {
      name: 'allows _tag access via bracket notation as value',
      code: `const x = result["_tag"]`,
    },
    {
      name: 'allows _tag in test assertion',
      code: `expect(result._tag).toBe('Right')`,
    },
    {
      name: 'allows _tag as span attribute value',
      code: `const attrs = { errorType: error._tag }`,
    },
    {
      name: 'allows _tag passed as function argument',
      code: `log(error._tag)`,
    },
    {
      name: 'allows _tag in template literal',
      code: 'const msg = `error: ${error._tag}`',
    },
    {
      name: 'allows _tag in array map',
      code: `const tags = items.map(e => e._tag)`,
    },
  ],
  invalid: [
    // === comparison
    {
      name: 'reports _tag in strict equality comparison',
      code: `if (result._tag === "Success") {}`,
      errors: defaultError('result._tag'),
    },
    // !== comparison
    {
      name: 'reports _tag in strict inequality comparison',
      code: `if (result._tag !== "Failure") {}`,
      errors: defaultError('result._tag'),
    },
    // switch statement
    {
      name: 'reports _tag in switch discriminant',
      code: `switch (result._tag) { case "Left": break }`,
      errors: defaultError('result._tag'),
    },
    // Nested member expression in comparison
    {
      name: 'reports _tag on nested member in comparison',
      code: `if (foo.bar._tag === "Baz") {}`,
      errors: defaultError('foo.bar._tag'),
    },
    // Bracket notation in comparison
    {
      name: 'reports _tag bracket notation in comparison',
      code: `if (result["_tag"] === "Left") {}`,
      errors: defaultError('result._tag'),
    },
    // Custom messages
    {
      name: 'uses custom expected and fix messages',
      code: `if (value._tag === 'X') {}`,
      options: [{ expected: 'Custom expected', fix: 'Custom fix' }],
      errors: [
        {
          messageId: 'forbidden' as const,
          data: {
            name: 'value._tag',
            expected: 'Custom expected',
            actual: 'direct _tag property access',
            fix: 'Custom fix',
          },
        },
      ],
    },
    // Allow list doesn't cover this identifier
    {
      name: 'reports _tag comparison not in allow list',
      code: `if (other._tag === 'X') {}`,
      options: [{ allow: ['result._tag'] }],
      errors: defaultError('other._tag'),
    },
    // Ternary with comparison
    {
      name: 'reports _tag in ternary comparison',
      code: `const x = result._tag === 'Left' ? 'bad' : 'good'`,
      errors: defaultError('result._tag'),
    },
    // Boolean expression with &&
    {
      name: 'reports _tag comparison in logical expression',
      code: `const ok = isValid && result._tag === 'Right'`,
      errors: defaultError('result._tag'),
    },
    // switch with member expression
    {
      name: 'reports _tag switch on nested member',
      code: `switch (error._tag) { case "NotFound": break; case "Timeout": break }`,
      errors: defaultError('error._tag'),
    },
  ],
})
