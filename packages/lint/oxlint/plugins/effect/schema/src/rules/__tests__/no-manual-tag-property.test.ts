import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noManualTagProperty } from '../no-manual-tag-property.js'

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

const defaultExpected = 'Schema.TaggedClass or Schema.TaggedError from effect (Schema as S from "effect")'
const defaultFix =
  "Replace manual _tag with class MyClass extends S.TaggedClass<MyClass>('TagName')('variantName', { ... }) {} for variants, or class MyError extends S.TaggedError<MyError>()('MyError', { ... }) {} for errors"

const forbiddenError = (className: string) => ({
  messageId: 'forbidden' as const,
  data: {
    name: `class ${className} with manual _tag property`,
    expected: defaultExpected,
    actual: 'manual _tag property declaration',
    fix: defaultFix,
  },
})

ruleTester.run('no-manual-tag-property', noManualTagProperty, {
  valid: [
    // Classes without _tag
    {
      name: 'allows class without _tag property',
      code: `
        class Foo {
          name = 'foo'
        }
      `,
    },
    {
      name: 'allows class with non-_tag property',
      code: `
        class Foo {
          tag = 'foo'
          type = 'bar'
        }
      `,
    },
    // Effect TaggedClass / TaggedError patterns
    {
      name: 'allows Schema.TaggedClass pattern',
      code: `
        import { Schema as S } from 'effect'
        class MyClass extends S.TaggedClass<MyClass>()('MyClass', { value: S.Number }) {}
      `,
    },
    {
      name: 'allows Schema.TaggedError pattern',
      code: `
        import { Schema as S } from 'effect'
        class MyError extends S.TaggedError<MyError>()('MyError', { message: S.String }) {}
      `,
    },
    // Allowlisted classes
    {
      name: 'allows class in allow list',
      code: `
        class LegacyAction {
          _tag = 'LegacyAction'
        }
      `,
      options: [{ allow: ['LegacyAction'] }],
    },
    {
      name: 'allows class in allow list case-insensitive',
      code: `
        class LegacyAction {
          _tag = 'LegacyAction'
        }
      `,
      options: [{ allow: ['legacyaction'] }],
    },
    // Empty class
    {
      name: 'allows empty class',
      code: `class Empty {}`,
    },
    // Computed property that happens to be _tag string
    {
      name: 'allows computed _tag property',
      code: `
        const key = '_tag'
        class Foo {
          [key] = 'foo'
        }
      `,
    },
    // Class expression without _tag
    {
      name: 'allows class expression without _tag',
      code: `
        const Foo = class {
          name = 'foo'
        }
      `,
    },
    // Literal property key that is NOT _tag (kills ConditionalExpression survivor on the Literal branch of isTagPropertyKey)
    {
      name: 'allows class with non-_tag string-literal property key',
      code: `
        class Foo {
          'name' = 'foo'
        }
      `,
    },
    // Constructor parameter property whose param name is NOT _tag (kills ConditionalExpression survivors in isTagParameter, the || in the constructor loop, and isTagAssignmentPattern's first conjunct)
    {
      name: 'allows class with non-_tag constructor parameter property',
      code: `
        class Foo {
          constructor(public name: string) {}
        }
      `,
    },
    // Constructor parameter property whose left name is NOT _tag (kills ConditionalExpression survivor on param.left.name === TAG_NAME)
    {
      name: 'allows class with non-_tag constructor parameter property default',
      code: `
        class Foo {
          constructor(public name = 'x') {}
        }
      `,
    },
    // PrivateIdentifier property key — the predicate's `return false` fallthrough is genuinely reachable for non-Identifier, non-Literal keys; mutant on that branch converting it to return true would over-report (kills BooleanLiteral survivor on line 19)
    {
      name: 'allows class with private-identifier key',
      code: `
        class Foo {
          #_tag = 'x'
        }
      `,
    },
  ],
  invalid: [
    // PropertyDefinition with _tag identifier
    {
      name: 'detects _tag property in class declaration',
      code: `
        class MyAction {
          _tag = 'MyAction'
        }
      `,
      errors: [forbiddenError('MyAction')],
    },
    // PropertyDefinition with _tag as string literal key
    {
      name: 'detects _tag as string literal property key',
      code: `
        class MyAction {
          '_tag' = 'MyAction'
        }
      `,
      errors: [forbiddenError('MyAction')],
    },
    // Class expression
    {
      name: 'detects _tag in class expression',
      code: `
        const MyAction = class MyAction {
          _tag = 'MyAction'
        }
      `,
      errors: [forbiddenError('MyAction')],
    },
    // Anonymous class expression
    {
      name: 'detects _tag in anonymous class expression',
      code: `
        const x = class {
          _tag = 'something'
        }
      `,
      errors: [forbiddenError('<anonymous>')],
    },
    // _tag with type annotation
    {
      name: 'detects _tag with type annotation',
      code: `
        class MyEvent {
          _tag: 'MyEvent' = 'MyEvent'
        }
      `,
      errors: [forbiddenError('MyEvent')],
    },
    // _tag as readonly
    {
      name: 'detects readonly _tag property',
      code: `
        class MyEvent {
          readonly _tag = 'MyEvent'
        }
      `,
      errors: [forbiddenError('MyEvent')],
    },
    // Custom expected/fix messages
    {
      name: 'uses custom expected and fix messages',
      code: `
        class MyAction {
          _tag = 'MyAction'
        }
      `,
      options: [{ expected: 'custom expected', fix: 'custom fix' }],
      errors: [{
        messageId: 'forbidden' as const,
        data: {
          name: 'class MyAction with manual _tag property',
          expected: 'custom expected',
          actual: 'manual _tag property declaration',
          fix: 'custom fix',
        },
      }],
    },
    // Multiple classes in one file
    {
      name: 'detects _tag in multiple classes',
      code: `
        class ActionA {
          _tag = 'ActionA'
        }
        class ActionB {
          _tag = 'ActionB'
        }
      `,
      errors: [
        forbiddenError('ActionA'),
        forbiddenError('ActionB'),
      ],
    },
    // Constructor with TSParameterProperty named _tag
    {
      name: 'detects _tag as constructor parameter property',
      code: `
        class MyAction {
          constructor(public _tag: string) {}
        }
      `,
      errors: [forbiddenError('MyAction')],
    },
    {
      name: 'detects _tag as constructor parameter property with default value',
      code: `
        class MyAction {
          constructor(public _tag = 'MyAction') {}
        }
      `,
      errors: [forbiddenError('MyAction')],
    },
    // Class with _tag and other properties
    {
      name: 'detects _tag among other properties',
      code: `
        class MyAction {
          name = 'action'
          _tag = 'MyAction'
          value = 42
        }
      `,
      errors: [forbiddenError('MyAction')],
    },
  ],
})
